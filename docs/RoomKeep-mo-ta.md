# RoomKeep: quản lý nhà trọ và phòng cho thuê

*Tagline: Run a rental-room property by room, tenant, contract, monthly meter readings, and collection status, offline-first, optional account sync via API.*

Tên **RoomKeep** là tên tạm, chưa kiểm tra trùng. Bạn tự search Play Store (có dấu và không dấu) và tra nhãn hiệu trước khi chốt. Package name viết liền, không dấu, ví dụ `com.yourname.roomkeep`.

**Đã áp dụng các yêu cầu của bạn:**
- **Một nhà trọ duy nhất, không phải chuỗi.** Không có "nhiều cơ sở". Người dùng tự nhập tên nhà trọ khi mở app lần đầu và sửa được trong cài đặt. Một nhà trọ có thể có nhiều dãy hoặc tầng.
- **App không xin quyền runtime nào** (không hộp thoại xin quyền). Nhưng vì có API nên app **phải khai quyền `INTERNET`** (quyền thông thường, cấp tự động khi cài); xem mục "Quyền và kết nối mạng".
- Không ảnh/Camera, không quét mã vạch/QR, không hóa đơn/thuế, không bảo mật dữ liệu.
- Nhóm cuối chỉ còn: xuất/nhập dữ liệu (để chuyển máy và làm bản dự phòng), Light/Dark, tên nhà trọ.
- **App có đủ chiều sâu tính năng** để tránh bị coi là quá sơ sài (xem mục "Chuẩn bị để qua chính sách Google Play"), kèm **15 tính năng bổ sung** đánh dấu **(mới)**.

**Một điểm cần bạn quyết định về "không sổ nợ":** nhà trọ về bản chất là thu tiền hằng tháng, và chủ trọ nào cũng cần biết phòng nào đã đóng, phòng nào chưa. Nên mình làm theo cách này:
- App có **trạng thái thu của từng kỳ** (đã thu, thu một phần, chưa thu) và ghi các lần thu của kỳ đó.
- App **không có sổ công nợ tích lũy**: không cộng dồn nợ qua các kỳ, không có màn hình "tổng nợ của khách", không nhắc nợ. Số thiếu của kỳ trước nếu muốn tính tiếp thì chủ trọ tự nhập tay vào dòng điều chỉnh của kỳ sau (tính năng 55).
- Nếu bạn muốn bỏ luôn cả trạng thái thu theo kỳ để tuân thủ tuyệt đối quy tắc "không công nợ", bạn nói mình, nhưng app sẽ kém hữu ích cho chủ trọ hơn đáng kể.

**Thay đổi lớn ở bản này: app có tài khoản và API.** Bạn yêu cầu thêm đăng ký, đăng nhập và các màn hình gọi API nên mình đã thêm **Nhóm 17 (tính năng 137-155)** và phần "Thiết kế API (đề xuất)". Những gì thay đổi so với bản offline, cần bạn biết trước:
- App **phải khai quyền `INTERNET`**, nên không còn đúng nếu ghi "app không xin quyền nào" (vẫn không có hộp thoại xin quyền).
- Dữ liệu khách thuê (tên, SĐT) **được gửi lên máy chủ của bạn**, nên Data safety, chính sách quyền riêng tư và trách nhiệm bảo vệ dữ liệu **thay đổi hoàn toàn** so với "chỉ lưu trên máy".
- Google Play **bắt buộc** app cho tạo tài khoản phải có **cách xóa tài khoản và dữ liệu ngay trong app** và một đường dẫn web để yêu cầu xóa (tính năng 143).
- **Mình không biết máy chủ của bạn.** Các endpoint trong file là **hợp đồng đề xuất** để backend làm theo. Nếu bạn đã có API sẵn, hãy gửi tài liệu API để mình sửa các màn hình cho khớp.
- Mình vẫn giữ **chế độ dùng không tài khoản** (tính năng 145) để app dùng được ngay và người duyệt không bị chặn bởi màn hình đăng nhập.

**Quy mô:** 159 tính năng, 18 nhóm.

---

## Mô tả tổng quan

Ứng dụng cho chủ nhà trọ, dãy phòng cho thuê, căn hộ mini, ký túc xá nhỏ (1 chủ, vài chục phòng, có thể có người quản lý và người dọn dẹp). Điểm đặc thù: mỗi phòng có **hợp đồng và khách thuê**, mỗi tháng phải **chốt chỉ số điện nước** rồi **tính tiền cả dãy phòng** (thuê, điện, nước, dịch vụ, giảm trừ), và còn phải lo **giữ chỗ, đặt cọc, bàn giao phòng, sửa chữa**. App giúp chủ trọ không quên chốt số, tính tiền đúng và nhanh, biết phòng nào trống bao lâu, hợp đồng nào sắp hết và nhà trọ lãi bao nhiêu. Dữ liệu lưu trên thiết bị bằng SQLite/Room nên **dùng được ngay không cần mạng**; khi chủ trọ đăng ký và đăng nhập, app **đồng bộ dữ liệu với máy chủ qua API** để dùng trên nhiều thiết bị và khôi phục khi đổi máy.

**Khác gì các app đã bàn:**
- Khác app cửa hàng và tiệm dịch vụ: trung tâm là **phòng, hợp đồng và kỳ thu hằng tháng**, doanh thu lặp lại theo hợp đồng chứ không theo từng lượt bán.
- **Điện nước theo chỉ số công tơ** là nghiệp vụ riêng: nhập chỉ số, tính tiêu thụ, bậc giá, tính theo đầu người, thay công tơ.
- Có **tính tiền theo ngày** khi khách vào hoặc ra giữa tháng, và **bàn giao phòng** hai chiều (vào và ra).

**Giới hạn cần nói rõ:**
- Khách **không tự xem tiền hay gửi yêu cầu qua app**. Mọi dữ liệu do chủ trọ hoặc người quản lý nhập.
- App **không xuất hóa đơn** (chỉ có bảng kê nội bộ để gửi khách xem) và **không có sổ công nợ tích lũy** (xem phần trên).
- App **không tự gửi tin nhắn** và **không thu tiền thay**. Cột "đã thu" chỉ là ghi chép của chủ trọ.
- **Không có ảnh** phòng hay giấy tờ. Mô tả phòng bằng chữ.
- App **không tư vấn pháp lý.** Mẫu hợp đồng, nội quy và danh sách người ở chỉ là văn bản và số liệu do chủ trọ tự soạn và tự chịu trách nhiệm. Quy định về đăng ký tạm trú, hợp đồng thuê và thuế của từng nơi do chủ trọ tự tìm hiểu.

---

## Quyền và kết nối mạng

Khi app gọi API, mình phải thay đổi một điều so với yêu cầu ban đầu của bạn: app **cần khai quyền `INTERNET`**.
- `INTERNET` (và tùy chọn `ACCESS_NETWORK_STATE` để biết có mạng hay không) là **quyền thông thường**: được cấp tự động khi cài, **không có hộp thoại xin quyền** hiện ra với người dùng. Tuy vậy nó **vẫn hiện trong danh sách quyền** của app, nên không được ghi "app không xin quyền nào".
- **Vẫn không xin bất kỳ quyền runtime nào:** không thông báo, không danh bạ, không Camera, không ảnh, không vị trí, không bộ nhớ ngoài, không báo thức chính xác, không chạy nền.
- **Vẫn không dùng thông báo đẩy.** Mọi nhắc việc hiện trong app. Muốn đẩy thông báo từ máy chủ thì phải thêm dịch vụ đẩy và quyền thông báo, ngoài phạm vi bản này.
- **Danh bạ:** vẫn nhập tay. Nút "gọi" mở trình quay số (`ACTION_DIAL`, không cần quyền gọi).
- **Xuất/nhập tệp** vẫn đi qua trình chọn tệp hệ thống (Storage Access Framework).
- **Chỉ gọi mạng qua HTTPS.** Cấu hình `network_security_config` cấm cleartext; không ghi log nội dung request và response; không để khóa bí mật hay địa chỉ nội bộ trong mã.
- **Token đăng nhập chỉ giữ trong bộ nhớ khi app đang chạy, không lưu xuống máy** (không Keystore, không SharedPreferences, không Room). Thoát hẳn app thì token mất và lần sau phải đăng nhập lại. **Không lưu mật khẩu** trên máy và không đưa token vào tệp xuất, log hay báo lỗi.
- **Không đồng bộ nền.** Đồng bộ chỉ chạy khi người dùng mở app hoặc bấm nút, nên không cần quyền chạy nền.
- Phần khai báo Data safety xem mục "Lưu ý khi đăng Google Play".

---

## Chuẩn bị để qua chính sách Google Play (chức năng tối thiểu)

Số lượng tính năng **không tự đảm bảo** được duyệt. Google xét app có chạy ổn định, có giá trị sử dụng thực và không sơ sài. Mình không thể biết chắc app của bạn có được duyệt hay không, nên hãy kiểm tra các điểm sau trước khi gửi:

1. **Mỗi tính năng trong bản phát hành phải chạy trọn vẹn.** Không có nút "sắp có", màn hình trống hoặc tính năng chưa nối dữ liệu. Chưa xong thì **bỏ khỏi bản phát hành**.
2. **Không phát hành bản quá tối giản:** bản đưa lên phải có chu trình khép kín (phòng → khách và hợp đồng → chỉ số điện nước → tính tiền kỳ → ghi thu → báo cáo) cùng tài khoản và đồng bộ chạy ổn, để app trông đầy đủ và dùng được thật.
3. **Mọi màn hình có trạng thái rỗng hữu ích** và **dữ liệu mẫu** (tính năng 7) để người xem thử thấy app hoạt động ngay.
4. **Không crash, không treo, không mất dữ liệu** khi xoay màn hình, quay lại từ nền, đổi cỡ chữ, chế độ tối. Kiểm thử trên vài kích thước màn hình và vài phiên bản Android.
5. **Nội dung trang cửa hàng đúng với app:** ảnh chụp màn hình thật, mô tả không hứa những gì app không làm (không "thu tiền online", không "xuất hóa đơn", không "nhắc tự động", không "khách xem phòng trực tuyến").
6. **Chính sách quyền riêng tư:** app gửi email của chủ trọ cùng tên và SĐT của người thuê (bên thứ ba) lên máy chủ, nên cần trang chính sách nêu rõ dữ liệu nào được thu thập, lưu ở đâu, giữ bao lâu, ai truy cập được và cách yêu cầu xóa; để đường dẫn trong Play Console và trong app. Khai Data safety khớp thực tế.
7. **Khai báo đúng trong Play Console:** đối tượng người dùng là người lớn, phân loại nội dung, hướng dẫn truy cập app ("không cần đăng nhập").
8. **Không lưu dữ liệu nhạy cảm không cần thiết:** không có trường số CCCD hay giấy tờ tùy thân. Chỉ lưu tên, SĐT, ghi chú.
9. **Yêu cầu thử nghiệm với tài khoản nhà phát triển mới** (ví dụ thử nghiệm kín trước khi lên bản chính thức) có thể áp dụng cho bạn; hãy xem điều kiện hiện hành trong Play Console vì chính sách thay đổi theo thời gian.
10. **Không nhồi tính năng giả để tăng số lượng.** App ít tính năng nhưng chạy tốt vẫn an toàn hơn app nhiều tính năng nhưng lỗi.
11. **Xóa tài khoản:** vì app cho tạo tài khoản, phải có mục xóa tài khoản và dữ liệu **ngay trong app** (tính năng 143) và một **đường dẫn web** nhận yêu cầu xóa, khai trong Play Console. Máy chủ phải xóa thật dữ liệu, không chỉ ẩn.
12. **Quyền truy cập cho người duyệt:** nếu một phần app cần đăng nhập, phải đưa **tài khoản thử** vào mục hướng dẫn truy cập app. Chế độ không tài khoản (145) giúp người duyệt dùng được app ngay.
13. **Máy chủ phải chạy ổn định trong lúc duyệt.** Nếu máy chủ ngừng hoặc trả lỗi mà app crash hoặc kẹt màn hình, đó là lý do bị từ chối. Mọi lỗi mạng phải có thông báo rõ và app vẫn dùng được offline (155).
14. **Không ghi "bảo mật" hay "mã hóa" quá mức:** chỉ ghi "truyền qua HTTPS" nếu đúng thực tế; phần lưu trữ và băm mật khẩu phía máy chủ là việc của backend, hãy làm đúng trước khi nói ra.

---

## Nhóm 1: Bắt đầu và cài đặt nhà trọ
1. **Tên nhà trọ do người dùng nhập** khi mở lần đầu, sửa được trong cài đặt; hiển thị trong app và trên bảng kê xuất. Khi có tài khoản, tên này gắn với tài khoản đang đăng nhập (nhập lúc đăng ký) và đổi tài khoản thì tên đổi theo
2. Thông tin nhà trọ: địa chỉ, SĐT chủ trọ, ghi chú in trên bảng kê; **tự điền từ bước đăng ký tài khoản** và sửa được sau đó
3. **Quy tắc thu tiền:** ngày chốt chỉ số, ngày bắt đầu kỳ, hạn thu, cách tính ngày lẻ (theo 30 ngày hay theo số ngày thực của tháng); nhập lúc đăng ký hoặc sau
4. **Đơn giá mặc định** của điện, nước và các dịch vụ chung; nhập lúc đăng ký hoặc sau
5. **Danh sách việc khởi động** (khai báo dãy, phòng, đơn giá, khách đầu tiên) có đánh dấu hoàn thành; các việc đã nhập lúc đăng ký (137) tự được đánh dấu xong
6. **Mẫu tin nhắn soạn sẵn** (nhắc chốt số, báo tiền tháng, nhắc hết hạn hợp đồng, thông báo chung) để sao chép gửi Zalo. App không tự gửi tin
7. **(mới)** **Dữ liệu mẫu để làm quen:** tạo bộ dữ liệu demo gắn nhãn, xóa sạch bằng một thao tác mà không động vào dữ liệu thật
8. Làm tròn tiền, định dạng ngày giờ, đơn vị điện (kWh) và nước (m³)
9. **Nội quy nhà trọ** soạn một lần, tự in trên bảng kê và hợp đồng

## Nhóm 2: Dãy, tầng và phòng
10. **Dãy và tầng:** tạo cấu trúc nhà trọ (dãy A, tầng 1...)
11. **Phòng:** tên, tầng, diện tích, giá thuê, sức chứa tối đa
12. **Loại phòng** (phòng thường, gác lửng, căn hộ mini) với giá gợi ý
13. **Tiện nghi của phòng** (điều hòa, bình nóng lạnh, giường, tủ...) mô tả bằng chữ
14. **Trạng thái phòng:** trống, đang thuê, giữ chỗ, đang sửa
15. **Sơ đồ phòng theo tầng** với màu theo trạng thái
16. **Giá thuê hiệu lực theo thời điểm;** cập nhật giá hàng loạt có xem trước, tạo bản ghi giá mới
17. **Đồ trang bị trong phòng** (danh sách đồ, số lượng, tình trạng) để đối chiếu khi bàn giao
18. **(mới)** **Gợi ý giá thuê tham khảo** từ tỷ lệ lấp đầy và thời gian phòng để trống; chỉ là gợi ý, chủ trọ quyết định
19. **Danh sách phòng trống lâu** theo số ngày để trống

## Nhóm 3: Khách thuê
20. **Hồ sơ khách thuê:** tên, SĐT, ghi chú
21. **Nhiều người ở một phòng:** người đại diện hợp đồng và người ở cùng
22. **Người liên hệ khẩn cấp** (chữ)
23. **Nơi làm việc hoặc học tập** (tùy chọn, chữ)
24. **Số xe** (chữ, tùy chọn) gắn với chỗ để xe
25. **Ngày vào, ngày ra** của từng người ở
26. **Lịch sử thuê** của khách (các phòng, các hợp đồng)
27. **Phân loại khách** (khách lâu năm, khách mới, sinh viên, gia đình)
28. **Ghi chú riêng** (giờ giấc, thói quen, yêu cầu đặc biệt)
29. Tìm **không dấu** theo tên khách, SĐT, tên phòng

## Nhóm 4: Hợp đồng thuê
30. **Tạo hợp đồng:** phòng, người đại diện, ngày bắt đầu, kỳ hạn
31. **Giá thuê và tiền cọc** của hợp đồng (cọc ghi chú số tiền và ngày nhận)
32. **Điều khoản bổ sung** viết bằng chữ
33. **Phụ phí cố định theo hợp đồng** (internet, rác, giữ xe, vệ sinh)
34. **Gia hạn hợp đồng,** có thể đổi giá
35. **Chấm dứt trước hạn** theo quy tắc nhà trọ, ghi lý do
36. **Thêm hoặc bớt người ở** giữa kỳ, cập nhật phụ phí theo đầu người
37. **Chuyển phòng:** chốt phòng cũ, mở phòng mới, chuyển cọc
38. **Danh sách hợp đồng sắp hết hạn** theo số ngày do chủ trọ đặt
39. **(mới)** **Mẫu hợp đồng soạn sẵn** để chủ trọ tự sửa nội dung và in ra. Đây là mẫu văn bản, không phải tư vấn pháp lý

## Nhóm 5: Điện nước và chỉ số công tơ
40. **Công tơ điện và nước theo phòng,** số công tơ, chỉ số khởi đầu
41. **Nhập chỉ số hằng tháng** theo phòng
42. **Tự tính tiêu thụ** = chỉ số kỳ này − chỉ số kỳ trước
43. **Bảng giá điện** đơn giá phẳng hoặc bậc thang do chủ trọ nhập
44. **Nước tính theo m³ hoặc theo đầu người** (chọn theo từng phòng)
45. **Cảnh báo chỉ số bất thường:** nhỏ hơn kỳ trước, tăng đột biến, không đổi nhiều kỳ
46. **Thay công tơ:** ghi chỉ số cuối của công tơ cũ và chỉ số đầu của công tơ mới
47. **Nhập nhanh theo tầng,** di chuyển bằng bàn phím số, bỏ qua phòng trống
48. **Chỉ số đầu và cuối khi khách vào hoặc ra** giữa kỳ
49. **(mới)** **So sánh tiêu thụ với trung bình** của phòng và của các phòng tương tự, để phát hiện nghi rò rỉ nước hoặc sử dụng bất thường

## Nhóm 6: Tính tiền kỳ
50. **Kỳ thu hằng tháng** cho toàn nhà trọ
51. **Tạo bảng tính tiền của kỳ** cho tất cả phòng đang thuê trong một lần
52. **Thành phần tiền của một phòng:** thuê + điện + nước + phụ phí + chi phí chung chia + điều chỉnh
53. **Tính theo ngày** khi khách vào hoặc ra giữa tháng
54. **Giảm trừ và khuyến mãi** (giảm giá, miễn một số ngày, tặng tháng)
55. **Điều chỉnh tay có lý do** (cộng hoặc trừ, ví dụ số thiếu của kỳ trước do chủ trọ tự quyết)
56. **Bảng kê chi tiết nội bộ** từng phòng để gửi khách xem (chỉ số, đơn giá, từng khoản). Không phải hóa đơn
57. **Trạng thái thu của kỳ:** đã thu, thu một phần, chưa thu
58. **Ghi các lần thu** (số tiền, ngày, phương thức ghi dạng ghi chú) cho từng phòng trong kỳ
59. **Khóa kỳ sau khi chốt** để số liệu cũ không bị sửa nhầm
60. **(mới)** **Tin nhắn báo tiền hàng loạt:** bảng kê rút gọn soạn sẵn theo từng phòng để sao chép gửi lần lượt

## Nhóm 7: Giữ chỗ, đặt cọc và bàn giao phòng
61. **Giữ chỗ phòng** cho khách tiềm năng với ngày hết hạn giữ chỗ
62. **Tiền cọc:** ghi số tiền, ngày nhận, hợp đồng liên quan
63. **Hoàn hoặc giữ cọc** khi kết thúc hợp đồng theo quy tắc nhà trọ
64. **Biên bản bàn giao phòng khi vào:** tình trạng phòng (chữ), đồ trang bị, chỉ số điện nước, khách xác nhận
65. **Biên bản khi trả phòng:** tình trạng, đồ thiếu hoặc hỏng, chỉ số cuối
66. **Trừ chi phí hư hỏng vào cọc** kèm lý do và số tiền
67. **(mới)** **Danh sách kiểm tra trả phòng** (khóa, đồ trang bị, chỉ số, vệ sinh, nhận lại chìa), đánh dấu từng mục

## Nhóm 8: Bảo trì và sửa chữa
68. **Yêu cầu sửa chữa** do khách báo, chủ trọ nhập, gắn với phòng
69. **Phân loại và mức ưu tiên** (khẩn, thường, khi rảnh)
70. **Danh bạ thợ sửa bên ngoài** (điện, nước, máy lạnh), nhập tay
71. **Chi phí sửa chữa** và ai chịu (chủ trọ hay khách)
72. **Trạng thái:** mới, đã giao việc, đang sửa, xong
73. **Lịch bảo trì định kỳ** do chủ trọ đặt (bình nóng lạnh, máy lạnh, bơm nước)
74. **Sổ thiết bị trong phòng:** tên, ngày lắp, ghi chú
75. **(mới)** **Lịch sử sửa chữa theo phòng** và thống kê phòng hay hỏng để quyết định thay mới

## Nhóm 9: Dịch vụ chung
76. **Dịch vụ thu theo phòng hoặc theo đầu người** (internet, rác, vệ sinh, gửi xe)
77. **Chỗ để xe:** danh sách chỗ, gắn khách, phí
78. **Máy giặt hoặc dịch vụ tính theo lượt** (ghi lượt dùng của phòng)
79. **Dịch vụ phát sinh** (thêm người, thêm xe, dọn phòng) tính vào kỳ
80. **Đơn giá dịch vụ hiệu lực theo thời điểm**
81. **(mới)** **Chia chi phí chung** (điện hành lang, bơm nước, vệ sinh khu chung) cho các phòng theo đều, theo đầu người hoặc theo diện tích

## Nhóm 10: Ra vào và nội quy
82. **Sổ khách thăm và ở qua đêm** do chủ trọ hoặc người quản lý ghi
83. **Danh sách người đang ở theo phòng** và ngày vào, để chủ trọ tự khai báo ngoài app theo quy định nơi mình. App không nộp khai báo
84. **Quy định giờ giấc** (giờ yên tĩnh, giờ khóa cổng) do chủ trọ soạn
85. **Ghi nhận vi phạm nội quy** bằng chữ, ngày, hướng xử lý
86. **Sổ giao nhận chìa khóa hoặc thẻ** theo phòng
87. **Thông báo chung soạn sẵn** (cắt nước, bảo trì, họp khu trọ) để gửi nhóm
88. **(mới)** **Nhóm nhận thông báo theo dãy hoặc tầng,** soạn một lần, chọn nhanh khi gửi

## Nhóm 11: Thu chi của nhà trọ
89. **Sổ thu chi tiền mặt** ngoài các kỳ thu
90. **Chi phí nhà trọ** (điện tổng, nước tổng, thuê đất, sửa chữa, lương, vật tư)
91. **Chi phí lặp lại** hằng tháng
92. **Điện nước tổng so với số thu từ khách:** chênh lệch mỗi tháng để biết đang lãi hay lỗ phần điện nước
93. **Đối soát tiền mặt cuối tháng** (số ghi thu và số tiền thực tế)
94. **(mới)** **Quỹ dự phòng sửa chữa:** sổ nội bộ trích mỗi tháng và chi khi sửa lớn

## Nhóm 12: Người quản lý và nhân sự
95. **Danh sách người quản lý, bảo vệ, người dọn dẹp** (nhãn phân công)
96. **Lịch làm việc** theo ca và ngày nghỉ
97. **Chấm công và lương** theo quy tắc chủ trọ
98. **Giao việc** (dọn khu chung, ghi chỉ số, thu tiền) và trạng thái
99. **Ghi chú bàn giao** giữa người quản lý
100. **Lịch dọn vệ sinh khu chung** theo ngày trong tuần
101. **(mới)** **Danh sách kiểm tra đi tuần hằng ngày** do chủ trọ tự soạn (cổng, đèn hành lang, khu để xe), đánh dấu hoàn thành

## Nhóm 13: Lợi nhuận và số liệu
102. **Doanh thu theo tháng** (thuê, điện nước, dịch vụ)
103. **Chi phí theo tháng** và theo hạng mục
104. **Lợi nhuận theo phòng** (thu − chi liên quan − phần chi chung phân bổ)
105. **Tỷ lệ lấp đầy** theo ngày và theo tháng
106. **Số ngày trống** của từng phòng và tổng thiệt hại thu nhập ước tính
107. **Thời gian ở trung bình** của khách và tỷ lệ gia hạn
108. **Tỷ lệ thu đủ theo kỳ** (tính trong từng kỳ, không cộng dồn nợ)
109. **Mục tiêu doanh thu** theo tháng
110. **(mới)** **Điểm hòa vốn và thời gian hoàn vốn ước tính** của từng phòng khi có chi phí đầu tư nhập vào; ghi rõ là ước tính

## Nhóm 14: Hôm nay và kế hoạch
111. **Màn hình "Hôm nay":** hạn thu, ngày chốt chỉ số, hợp đồng sắp hết, sửa chữa đang chờ, giữ chỗ sắp hết hạn
112. **Lịch tháng tổng hợp** (hạn thu, hết hạn hợp đồng, bảo trì, giữ chỗ)
113. **Danh sách việc cần làm** do chủ trọ thêm, có lặp lại
114. **Lịch chốt chỉ số** theo tầng và dãy, đánh dấu phòng đã nhập
115. **Lịch hết hạn hợp đồng** theo tháng
116. **Dự báo doanh thu 3 tháng tới** từ các hợp đồng đang chạy và hạn hết hạn; chỉ là ước tính
117. **(mới)** **Dự báo số phòng trống 60 ngày tới** từ ngày hết hạn hợp đồng và giữ chỗ, để chủ trọ biết lúc nào cần tìm khách
118. Xuất báo cáo Excel/PDF nội bộ

## Nhóm 15: Phản hồi và chất lượng
119. **Phản hồi của khách thuê** (chữ hoặc chấm 1-5) theo phòng
120. **Khiếu nại** và cách xử lý, chi phí
121. **Ghi nhận về khách thuê** (nội bộ, bằng chữ) cho lần xem xét gia hạn
122. **Thống kê thu trễ theo kỳ** của từng phòng (đếm số kỳ thu sau hạn, không cộng dồn tiền)
123. **Lý do trả phòng** (giá, vị trí, chuyển việc, nội quy, khác)
124. **(mới)** **Thống kê lý do rời đi** theo thời gian để điều chỉnh giá và dịch vụ
125. **Danh sách phòng cần chú ý** (hay hỏng, hay trống, hay thu trễ)

## Nhóm 16: Tiện ích
126. **Tìm kiếm toàn cục** theo phòng, khách, hợp đồng, không dấu
127. **Nhập phòng và khách hàng loạt từ CSV,** có xem trước và báo lỗi
128. **Nội quy và điều khoản in** gọn trên một trang để dán tại nhà trọ
129. **Máy tính tiền vào giữa tháng:** nhập ngày vào, giá thuê, ra số tiền từ ngày vào đến hết kỳ; không lưu dữ liệu
130. **Danh sách nhắn khách hàng loạt:** tin nhắn soạn sẵn theo từng phòng để sao chép gửi lần lượt
131. **Danh sách việc đầu tháng và cuối tháng** do chủ trọ tự soạn (chốt số, tạo kỳ, đối soát), đánh dấu hoàn thành
132. **Thư viện mẫu tin nhắn** theo tình huống, sửa được
133. **Bảng giá phòng niêm yết** xuất PDF để dán trước nhà hoặc gửi khách tìm phòng
134. **Lịch xem phòng:** khách tìm thuê hẹn xem phòng nào, lúc nào
135. **(mới)** **Danh sách khách tiềm năng:** liên hệ, phòng quan tâm, ngày dự kiến vào, ghi chú; tự gợi ý khi có phòng trống phù hợp
136. **So sánh phòng nhanh:** hai hoặc ba phòng cạnh nhau (giá, diện tích, tiện nghi) để tư vấn khách

## Nhóm 17: Tài khoản và đồng bộ qua API
137. **Đăng ký tài khoản kèm đăng ký thông tin nhà trọ,** làm theo từng bước: (1) tài khoản: email, mật khẩu, tên hiển thị, đồng ý điều khoản và chính sách quyền riêng tư; (2) thông tin nhà trọ: tên nhà trọ, địa chỉ, SĐT chủ trọ; (3) quy tắc thu tiền: ngày chốt chỉ số, hạn thu, cách tính ngày lẻ; (4) đơn giá điện, nước và các dịch vụ chung ban đầu; (5) cấu trúc ban đầu: số dãy, số tầng, số phòng và giá thuê mặc định để tạo phòng hàng loạt. Bước 3-5 có thể **bỏ qua** và nhập sau trong cài đặt; app lưu dở dang nếu người dùng thoát giữa chừng
138. **Đăng nhập** bằng email và mật khẩu, hiện lỗi rõ khi sai thông tin hoặc mất mạng
139. **Đăng xuất,** tùy chọn giữ hoặc xóa dữ liệu trên máy
140. **Quên mật khẩu và đặt lại** qua email do máy chủ gửi
141. **Đổi mật khẩu** (nhập mật khẩu cũ), đăng xuất các thiết bị khác sau khi đổi
142. **Hồ sơ tài khoản và hiển thị theo người dùng:** xem và sửa tên hiển thị, email, tên nhà trọ; thanh đầu app luôn hiện tên hiển thị, tên nhà trọ và vai trò của người đang đăng nhập; toàn bộ dữ liệu trên màn hình chỉ là của tài khoản đó
143. **Xóa tài khoản và dữ liệu trên máy chủ** ngay trong app, có xác nhận mật khẩu và cảnh báo không thể hoàn tác; kèm đường dẫn web yêu cầu xóa
144. **Xác thực bằng token và phiên đăng nhập:** access token sống lâu hơn (đề xuất 2 giờ), **tự làm mới khi người dùng đang dùng app**; **chuyển sang app khác (ví dụ Zalo) rồi quay lại thì app vẫn giữ phiên**; chỉ khi ở nền hoặc không thao tác **quá khoảng 1 giờ** hoặc thoát hẳn app thì phiên mất và phải đăng nhập lại; khi mất mạng thì hiện thông báo lỗi mạng rõ ràng; báo trước khi phiên sắp hết và tự đăng xuất khi làm mới thất bại
145. **Chế độ không tài khoản:** dùng toàn bộ tính năng chỉ trên máy; đăng ký sau thì dữ liệu hiện có được đẩy lên máy chủ
146. **Màn hình trạng thái kết nối:** đang trực tuyến hay ngoại tuyến, máy chủ phản hồi chưa (kiểm tra sức khỏe máy chủ), phiên bản app và phiên bản API, bắt buộc cập nhật khi quá cũ
147. **Đẩy dữ liệu lên máy chủ** (bấm tay hoặc khi mở app), hiện số bản ghi đã gửi và lỗi
148. **Tải dữ liệu từ máy chủ** về máy (lần đầu đăng nhập trên máy mới hoặc khi bấm cập nhật), có thanh tiến độ
149. **Hàng đợi thay đổi khi ngoại tuyến:** mọi chỉnh sửa lúc mất mạng được xếp hàng, tự gửi khi có mạng và app đang mở, thử lại có giãn cách
150. **Xử lý xung đột:** khi hai thiết bị sửa cùng một bản ghi, hiện màn hình so sánh bản trên máy và bản trên máy chủ để chọn bản giữ lại
151. **Nhật ký đồng bộ:** lần đồng bộ gần nhất, hướng gửi hay nhận, số bản ghi, kết quả và lỗi, xem lại được
152. **Phạm vi đồng bộ:** bật hoặc tắt từng nhóm dữ liệu (khách thuê, hợp đồng, chỉ số, kỳ thu, chi phí...)
153. **Thiết bị đã đăng nhập:** danh sách thiết bị, lần hoạt động cuối, đăng xuất từ xa một thiết bị
154. **Mời người quản lý và phân quyền hiển thị:** tạo mã mời có hạn dùng, người nhận đăng ký hoặc đăng nhập rồi nhập mã để vào cùng nhà trọ; vai trò quyết định màn hình nào hiện (đề xuất: chủ trọ thấy tất cả, quản lý không thấy lợi nhuận, lương, xóa tài khoản và mời người); thu hồi được
155. **Xử lý lỗi API và lỗi mạng thân thiện:** khi mất mạng hay máy chủ không phản hồi thì hiện thông báo rõ ràng ("Không có kết nối mạng, vui lòng kiểm tra và thử lại") kèm nút thử lại; đăng nhập, đăng ký, quên mật khẩu mất mạng cũng báo đúng như vậy, không treo và không crash; thông báo riêng cho hết phiên, sai dữ liệu, máy chủ bận; khi **đang trong phiên** mà mất mạng thì vẫn dùng bình thường trên dữ liệu đã có, hiện dải báo "đang ngoại tuyến", và thay đổi xếp hàng chờ gửi

## Nhóm 18: Dữ liệu và giao diện
156. **Xuất/nhập dữ liệu** qua trình chọn tệp hệ thống, để chuyển sang máy khác hoặc làm bản dự phòng
157. Light/Dark theme
158. Tùy chỉnh tên nhà trọ hiển thị trong app và trên bảng kê/báo cáo
159. **Đa ngôn ngữ:** chọn ngôn ngữ giao diện trong cài đặt (đề xuất Tiếng Việt và English; thêm ngôn ngữ khác được), mặc định theo ngôn ngữ hệ thống, đổi có hiệu lực ngay; ngày, giờ, số và tiền hiển thị theo ngôn ngữ; mẫu tin nhắn, bảng kê và biên bản in theo ngôn ngữ đã chọn; thông báo lỗi từ máy chủ được dịch theo mã lỗi; ngôn ngữ ưa thích lưu theo tài khoản

---

## Data schema (Room)

Mọi khóa chính dùng **UUID chuỗi** do máy khách sinh (để tạo offline không trùng). Mọi bảng có `updatedAt`, `isDeleted` (xóa mềm, đóng vai trò dấu xóa khi đồng bộ), `isDemo` (dữ liệu mẫu) và `serverRev` (số phiên bản do máy chủ gán, rỗng khi chưa đồng bộ). Tiền lưu **số nguyên đồng**. Chỉ số điện lưu **số nguyên Wh** hoặc kWh nhân 10 tùy chọn một đơn vị cố định cho cả app; chỉ số nước lưu **số nguyên lít** (hiển thị m³). Ngày lưu dạng `yyyy-MM-dd` (ngày địa phương), kỳ thu lưu `yyyy-MM`.

```
AppSettings(id, language, propertyName, address, phone, cycleStartDay, dueDay, dayCountMode, roundingStep,
            dateFormat, rulesText, theme)
Block(id, name, sortOrder)                                          // dãy
Floor(id, blockId, label, sortOrder)
RoomType(id, name, suggestedPrice)
Room(id, floorId, typeId, name, nameNoAccent, areaSqm, capacity, status, amenitiesText, note)
RoomPrice(id, roomId, monthlyRent, effectiveFrom)
RoomItem(id, roomId, name, qty, conditionText, note)               // đồ trang bị
RoomDevice(id, roomId, name, installedDate, note)
PriceBatch(id, name, createdAt, effectiveAt, ruleJson, status)
OnboardingStep(id, key, isDone)
MessageTemplate(id, name, body)
Tenant(id, name, nameNoAccent, phone, workplaceText, vehicleText, segment, emergencyContactText, note)
Occupant(id, contractId, tenantId, isLeader, moveInDate, moveOutDate)
Contract(id, roomId, leaderTenantId, startDate, endDate, monthlyRent, depositAmount, depositDate,
         extraTerms, status, terminationReason, renewedFromId, createdAt)
ContractFee(id, contractId, serviceId, calcMode, amount, effectiveFrom)
ContractChange(id, contractId, changedAt, fieldKey, oldValue, newValue, note)
RoomTransfer(id, contractId, fromRoomId, toRoomId, transferDate, depositMovedAmount)
ContractTemplate(id, name, bodyText)
Reservation(id, roomId, prospectId, tenantName, phone, fromDate, holdUntilDate, depositAmount, status, note)
Prospect(id, name, phone, interestedRoomsText, expectedMoveIn, note, status)
Viewing(id, prospectId, roomId, date, startMinute, note, status)
Meter(id, roomId, kind, serialNo, initialReading, installedDate, isActive)   // điện / nước
MeterReading(id, meterId, cycle, readingDate, readingValue, consumption, note, isReset)
MeterReplacement(id, oldMeterId, newMeterId, oldFinalReading, newInitialReading, date)
ElectricityTier(id, name, fromKwh, toKwh, pricePerKwh, effectiveFrom)
WaterRate(id, mode, pricePerUnit, effectiveFrom)
Service(id, name, calcMode, defaultPrice, isFixedFee)
ServicePrice(id, serviceId, price, effectiveFrom)
ParkingSlot(id, label, tenantId, monthlyFee, vehicleText)
UsageLog(id, roomId, serviceId, cycle, qty, date)
SharedCost(id, cycle, name, amount, splitMode)
SharedCostShare(id, sharedCostId, roomId, amount)
BillingCycle(id, cycle, status, lockedAt, note)                     // 'yyyy-MM'
RoomStatement(id, cycleId, roomId, contractId, rentAmount, electricAmount, waterAmount, feesAmount,
              sharedAmount, discountAmount, adjustAmount, totalAmount, prorationNote, collectStatus)
StatementLine(id, statementId, kind, description, qty, unitPrice, amount)
StatementAdjust(id, statementId, amount, reason, createdAt)
Collection(id, statementId, amount, paidAt, methodNote)            // lần thu, chỉ ghi thêm
DepositEntry(id, contractId, type, amount, date, reason)           // nhận / hoàn / trừ, chỉ ghi thêm
HandoverRecord(id, contractId, roomId, kind, conditionText, itemsJson, meterReadingsJson, tenantConfirmed, date)
CheckoutCheck(id, contractId, itemKey, isDone)
DamageCharge(id, contractId, description, amount)
RepairRequest(id, roomId, tenantId, reportedDate, category, priority, description, status, repairerId, cost, costBearer, doneDate)
Repairer(id, name, phone, skillText, note)
MaintenancePlan(id, roomId, deviceId, title, intervalDays, lastDoneDate)
MaintenanceLog(id, planId, date, cost, note)
Visitor(id, roomId, name, phone, visitDate, stayedOvernight, note)
KeyLog(id, roomId, keyLabel, givenTo, givenDate, returnedDate)
RuleViolation(id, roomId, tenantId, date, text, action)
Announcement(id, title, body, targetJson, createdAt)
CashEntry(id, type, amount, reason, date)
Expense(id, category, amount, date, isRecurring)
UtilityBill(id, cycle, kind, totalAmount, totalUnits)               // điện nước tổng nhà trọ
ReserveFundEntry(id, type, amount, date, reason)
Staff(id, name, role, note)
StaffSchedule(id, staffId, date, shiftLabel)
StaffPay(id, staffId, cycle, amount, note)
TaskItem(id, title, assigneeId, dueDate, status, refType, refId)
CleaningPlan(id, area, dayOfWeek, staffId)
PatrolItem(id, title, sortOrder)
PatrolRun(id, itemId, date, isDone, doneBy)
Feedback(id, roomId, tenantId, score, text, date)
Complaint(id, roomId, tenantId, date, text, resolution, cost, status)
TenantNote(id, tenantId, text, date)
MoveOutReason(id, contractId, reasonKey, note)
Investment(id, roomId, amount, date, note)
Target(id, month, targetRevenue)
Todo(id, title, dueAt, repeatRule, isDone)
ChecklistItem(id, kind, title, sortOrder)
ChecklistRun(id, itemId, period, isDone)

// Tài khoản và đồng bộ (Nhóm 17). Token KHÔNG nằm trong Room và không lưu xuống máy: chỉ giữ trong bộ nhớ khi app chạy.
Account(id, serverAccountId, serverPropertyId, email, displayName, propertyName, role, preferredLanguage, createdAt)
RegistrationDraft(id, step, accountJson, propertyJson, billingJson, ratesJson, layoutJson, updatedAt)   // lưu dở khi đăng ký, không chứa mật khẩu    // bản sao hồ sơ, không có mật khẩu
SyncOutbox(id, tableName, recordId, op, payloadJson, baseRev, idempotencyKey, createdAt, attempts, lastError)
SyncState(id, lastPulledRev, lastPushAt, lastPullAt, deviceId, scopeJson)
SyncConflict(id, tableName, recordId, localJson, serverJson, detectedAt, resolution)
SyncLog(id, at, direction, recordsCount, status, errorText)
DeviceSession(id, serverDeviceId, name, lastSeenAt, isCurrent)
InviteLocal(id, code, role, expiresAt, status)
```

---

## Điểm kỹ thuật cần cẩn thận

- **Tính tiêu thụ điện nước (41, 42, 46):** tiêu thụ = chỉ số kỳ này − chỉ số kỳ trước **cùng công tơ**. Khi thay công tơ (46), chỉ số cuối của công tơ cũ và chỉ số đầu của công tơ mới được ghi cùng một giao dịch, và tiêu thụ của kỳ đó là tổng hai đoạn. Đánh dấu `isReset` để không bị cảnh báo "nhỏ hơn kỳ trước" nhầm.
- **Cảnh báo bất thường (45, 49):** chỉ hiện cảnh báo, không chặn lưu. Ngưỡng so với trung bình các kỳ gần nhất của chính phòng đó và của nhóm phòng cùng loại. Là gợi ý, không kết luận rò rỉ.
- **Điện bậc thang (43):** chia tiêu thụ vào từng bậc theo khoảng `[from, to)`, nhân đơn giá từng bậc, cộng lại. Làm tròn **một lần ở cuối** mỗi khoản, phần dư dồn vào dòng cuối để tổng bảng kê khớp. Đơn giá có `effectiveFrom` và bảng kê **lưu số tiền đã tính (`amount`)**, không tính lại khi đổi giá sau này.
- **Tính theo ngày (53, 129):** `tiền = giá thuê × số ngày ở ÷ số ngày cơ sở của kỳ`. Số ngày cơ sở là 30 hoặc số ngày thực của tháng theo `dayCountMode`; ngày vào tính là ngày ở, ngày ra tính hay không thì theo quy tắc nhà trọ. Hiển thị cách tính để khách kiểm tra.
- **Điện nước tính theo đầu người (44):** số người lấy từ `Occupant` có ngày vào/ra trong kỳ; nếu số người đổi giữa kỳ thì tính theo số ngày ở của từng người, không lấy số người cuối kỳ.
- **Tạo bảng tính tiền (51):** sinh `RoomStatement` cho mọi hợp đồng đang hiệu lực trong kỳ, kể cả hợp đồng bắt đầu hoặc kết thúc giữa kỳ. Chạy lại không tạo trùng (khóa duy nhất theo kỳ và hợp đồng). Phòng chưa nhập chỉ số thì đánh dấu "thiếu chỉ số" thay vì tính 0.
- **Trạng thái thu (57, 58):** `Collection` chỉ ghi thêm; trạng thái của kỳ **suy ra** từ tổng thu so với `totalAmount` (chưa thu, thu một phần, đã thu), không lưu độc lập để tránh lệch. Không có bảng hay màn hình cộng dồn nợ qua kỳ; số thiếu muốn mang sang kỳ sau thì chủ trọ nhập tay ở `StatementAdjust`.
- **Khóa kỳ (59):** sau khi khóa, sửa `RoomStatement` bị chặn trừ khi mở khóa có ghi lại. Thay đổi giá sau khi khóa không ảnh hưởng kỳ cũ vì số tiền đã được lưu.
- **Tiền cọc (62, 63, 66):** `DepositEntry` chỉ ghi thêm (nhận, hoàn, trừ). Số cọc hiện có là tổng các bản ghi. Chuyển phòng (37) tạo bút toán chuyển, không sửa bản ghi cũ. Đây là sổ ghi chép nội bộ, không phải ví tiền.
- **Chia chi phí chung (81):** chia theo đều, theo đầu người hoặc theo diện tích, rồi làm tròn một lần và dồn phần dư vào phòng cuối để tổng các phần bằng đúng số tiền gốc.
- **Hợp đồng và phòng (30-38):** một phòng chỉ có **một hợp đồng hiệu lực** tại một thời điểm; kiểm tra trùng khoảng ngày `startA < endB && startB < endA`. Giữ chỗ (61) cũng kiểm tra trùng với hợp đồng và giữ chỗ khác. Hợp đồng hết hạn là trạng thái **tính khi mở app**, không có nhắc nền.
- **Dự báo (116, 117):** tính từ `endDate` hợp đồng và giữ chỗ, giả định mặc định là không gia hạn (hoặc dùng tỷ lệ gia hạn lịch sử nếu đủ dữ liệu). Ghi rõ là ước tính và không dự báo khi dữ liệu còn ít.
- **Hòa vốn (110):** dùng chi phí đầu tư nhập tay; kết quả hiển thị là ước tính, không phải lời khuyên tài chính.
- **Dữ liệu mẫu (7):** mọi bản ghi mẫu có `isDemo = true`; sửa bản ghi mẫu thì đổi thành `false` để thao tác xóa mẫu không xóa mất dữ liệu người dùng đã chỉnh. Khi xuất có tùy chọn bỏ qua dữ liệu mẫu.
- **Tìm kiếm toàn cục (126):** dùng Room FTS trên văn bản đã chuẩn hóa không dấu; cập nhật chỉ mục khi sửa hoặc xóa mềm.
- **Tìm không dấu:** lưu `nameNoAccent` chuẩn hóa một dạng (bỏ dấu, chữ thường), vì dấu dựng sẵn và dấu tổ hợp cho hai chuỗi khác nhau.
- **Xuất/nhập (156):** thêm bản ghi chưa có, bỏ qua bản ghi đã có. Cùng `id` thì `updatedAt` mới hơn thắng. `Collection`, `DepositEntry` và `MeterReading` đã chốt chỉ ghi thêm nên không bao giờ bị ghi đè. Xóa mềm để lệnh xóa cũng truyền được qua file. Khi đã có tài khoản thì đây chủ yếu là **bản dự phòng thứ hai** ngoài máy chủ; tệp xuất **không chứa token hay mật khẩu**.

## Dữ liệu và giao diện theo từng tài khoản

Mỗi người đăng ký chỉ thấy **dữ liệu của chính mình** (và của nhà trọ mà mình thuộc về). Cách làm:
- **Phía máy chủ quyết định, không tin ứng dụng:** mọi endpoint lấy danh tính từ **token**, không nhận `accountId` hay `propertyId` từ client. Mỗi bản ghi trên máy chủ có `propertyId`; mọi truy vấn đều lọc theo `propertyId` rút từ token. Một người không thể đọc dữ liệu của người khác dù biết `id` bản ghi.
- **Mỗi tài khoản một cơ sở dữ liệu Room riêng trên máy** (ví dụ tệp `roomkeep_<accountId>.db`, chế độ không tài khoản dùng `roomkeep_local.db`). Đổi tài khoản là mở tệp khác, **không bao giờ trộn** dữ liệu và không cần lọc theo tài khoản trong từng truy vấn.
- **Giao diện hiển thị theo người đăng nhập:** thanh đầu app và bảng kê hiện tên nhà trọ đăng ký, tên hiển thị và vai trò; các số liệu, danh sách phòng, khách, kỳ thu đều chỉ là dữ liệu của tài khoản đó.
- **Vai trò (đề xuất):** `owner` thấy và làm mọi thứ; `manager` không thấy lợi nhuận, lương, chi phí tổng, không xóa tài khoản và không mời người. Máy chủ **cũng chặn** các endpoint đó với `manager`, không chỉ ẩn nút ở app.
- **Đăng xuất:** về màn hình chọn "đăng nhập" hoặc "dùng không tài khoản"; dữ liệu của tài khoản vừa thoát giữ lại hay xóa tùy lựa chọn (139).
- **Nhiều người dùng chung một máy:** mỗi người đăng nhập tài khoản của mình, thấy đúng dữ liệu của mình.

## Thiết kế API (đề xuất)

Mình không biết backend của bạn. Phần này là **hợp đồng đề xuất** để backend làm theo và để mình thiết kế màn hình. Nếu bạn đã có API, hãy đưa tài liệu để mình đối chiếu lại các màn hình và schema.

**Đăng ký là một yêu cầu duy nhất** tạo cả tài khoản lẫn nhà trọ trong **một giao dịch** phía máy chủ: hoặc cả hai thành công, hoặc không gì được tạo (tránh có tài khoản mà không có nhà trọ). Các phần `billing`, `rates` và `layout` là tùy chọn. Trả về token và dữ liệu nhà trọ vừa tạo để app ghi thẳng vào Room mà không cần đồng bộ lại lần đầu.

**Quy ước chung:** chỉ HTTPS; header `Accept-Language` (vi hoặc en) để máy chủ gửi email quên mật khẩu đúng ngôn ngữ; tiền tố `/v1`; JSON; ngày `yyyy-MM-dd`, thời điểm theo ISO 8601 UTC; header `Authorization: Bearer <access token>`; lỗi trả `{ "code": "...", "message": "..." }` kèm mã HTTP đúng nghĩa.

| Chức năng | Endpoint đề xuất | Màn hình dùng |
|---|---|---|
| Đăng ký tài khoản và nhà trọ | `POST /v1/auth/register` {account: {email, password, displayName}, property: {name, address, phone, billing: {meterDay, dueDay, dayCountMode}, rates: {electric, water, services[]}, layout: {blocks[], floors[], rooms[]}}, deviceName} → 201 {account, property, tokens} | 137 |
| Đăng nhập | `POST /v1/auth/login` {email, password, deviceName} → token | 138 |
| Làm mới token | `POST /v1/auth/refresh` {refreshToken} | 144 |
| Đăng xuất | `POST /v1/auth/logout` {refreshToken} | 139 |
| Quên mật khẩu | `POST /v1/auth/forgot` {email} (luôn trả 202) | 140 |
| Đặt lại mật khẩu | `POST /v1/auth/reset` {token, newPassword} | 140 |
| Đổi mật khẩu | `POST /v1/auth/change-password` {oldPassword, newPassword} | 141 |
| Xem, sửa hồ sơ (gồm ngôn ngữ ưa thích) | `GET /v1/me`, `PATCH /v1/me` | 142, 159 |
| Xóa tài khoản | `DELETE /v1/me` {password} | 143 |
| Kiểm tra máy chủ | `GET /v1/health` → {status, apiVersion, minAppVersion} | 146 |
| Đẩy thay đổi | `POST /v1/sync/push` {deviceId, changes[]} → {accepted, conflicts, newRev} | 147, 149 |
| Tải thay đổi | `GET /v1/sync/pull?since=<rev>&limit=` → {changes, nextRev, hasMore} | 148 |
| Thiết bị | `GET /v1/devices`, `DELETE /v1/devices/{id}` | 153 |
| Mời người quản lý | `POST /v1/invites` {role} → {code, expiresAt}; `POST /v1/invites/accept` {code} | 154 |

**Cơ chế token và phiên đăng nhập (đề xuất):**
- Đăng nhập thành công trả **access token** (JWT ký bởi máy chủ, sống khoảng **2 giờ**) và **refresh token** (chuỗi ngẫu nhiên, lưu băm trên máy chủ, hết hạn trượt theo hoạt động). Có **hạn tuyệt đối của phiên** (đề xuất 12 giờ) để phiên không kéo dài vô hạn dù luôn được làm mới.
- Access token chứa `sub` (tài khoản), `propertyId`, `role`, `exp`. Máy chủ **luôn kiểm tra lại quyền** theo dữ liệu hiện tại, không chỉ tin `role` trong token.
- **Tự làm mới khi đang dùng app:** app theo dõi hạn của access token và **làm mới trước khi hết hạn** (ví dụ còn 5 phút) chỉ khi app đang ở trước màn hình và có thao tác gần đây. Ngoài ra gặp `401` thì bộ xác thực (authenticator) gọi `/auth/refresh` **một lần** rồi gửi lại yêu cầu.
- **Xoay refresh token:** mỗi lần làm mới trả cặp token mới và vô hiệu token cũ; nếu token cũ bị dùng lại thì máy chủ thu hồi cả phiên (nghi bị lộ).
- **Không lưu token xuống máy:** access token và refresh token chỉ nằm trong bộ nhớ của tiến trình app. Thoát app (vuốt khỏi danh sách ứng dụng, hệ thống thu hồi tiến trình) là mất phiên, **lần sau phải đăng nhập lại**. Chỉ nhớ **email** (không nhớ mật khẩu) để điền sẵn ô đăng nhập, và có thể tắt.
- **Chuyển sang app khác rồi quay lại (ví dụ sang Zalo gửi tin nhắn):** app **vẫn sống và giữ nguyên phiên cùng màn hình đang làm dở**, không hỏi đăng nhập. Khi quay lại, nếu access token đã hết hạn thì tự làm mới ngay, người dùng không thấy gì.
- **Hết phiên do để ở nền hay không thao tác quá lâu:** đếm từ lúc app ra nền hoặc từ thao tác cuối, **ngưỡng đề xuất 1 giờ**. Quá hạn (hoặc hệ thống đã thu hồi tiến trình, hoặc người dùng thoát hẳn app) thì xóa token khỏi bộ nhớ và hiện màn hình đăng nhập khi mở lại.
- Đăng xuất, đổi mật khẩu, xóa thiết bị hoặc xóa tài khoản đều **thu hồi refresh token** tương ứng; hết phiên ở app cũng gọi thu hồi nếu có mạng.
- Token không đưa vào URL, log, tệp xuất hay báo lỗi.

**Mỗi thay đổi đồng bộ** có dạng `{table, id, op (upsert hoặc delete), updatedAt, baseRev, payload, idempotencyKey}`.

**Điều backend phải làm đúng (không thuộc phần app):** băm mật khẩu bằng thuật toán chuyên dụng (Argon2 hoặc bcrypt), giới hạn số lần thử đăng nhập, token truy cập ngắn hạn và token làm mới có thể thu hồi, kiểm tra quyền theo nhà trọ ở mọi endpoint (một chủ trọ không đọc được dữ liệu của chủ trọ khác), xóa dữ liệu thật khi nhận lệnh xóa tài khoản, sao lưu máy chủ định kỳ, ghi log không chứa dữ liệu cá nhân.

## Điểm kỹ thuật phần tài khoản và API

- **Offline trước, mạng sau:** giao diện **chỉ đọc từ Room**; gọi API chỉ để đồng bộ. Nhờ vậy mất mạng hay máy chủ lỗi không làm hỏng màn hình nào.
- **Hàng đợi gửi (149):** mỗi thay đổi ghi vào `SyncOutbox` **trong cùng giao dịch Room** với thay đổi dữ liệu để không mất. Gửi theo lô, kèm `idempotencyKey` để gửi lại không tạo bản ghi trùng. Lỗi mạng thì thử lại có giãn cách tăng dần; lỗi do dữ liệu (HTTP 4xx) thì đánh dấu lỗi và hiện ở nhật ký, không thử vô hạn.
- **Thứ tự bằng `serverRev`, không bằng đồng hồ máy:** đồng hồ điện thoại có thể sai. Kéo dữ liệu theo con trỏ `since=<rev>`; `updatedAt` chỉ dùng để hiển thị và làm tiêu chí phụ khi xung đột.
- **Xung đột (150):** gửi kèm `baseRev` (phiên bản mà thay đổi dựa trên). Nếu máy chủ đã có phiên bản mới hơn thì trả xung đột. Với bản ghi thường thì hiện màn hình chọn; với **bảng chỉ ghi thêm** (`Collection`, `DepositEntry`, `MeterReading` đã chốt) thì **luôn hợp nhất, không bao giờ xung đột**.
- **Xóa:** dùng dấu xóa (`isDeleted`) gửi lên máy chủ như một thay đổi; không xóa cứng bản ghi cho đến khi mọi thiết bị đã nhận dấu xóa.
- **Kỳ đã khóa (59):** thay đổi lên một kỳ đã khóa từ thiết bị khác bị máy chủ **từ chối** với mã lỗi riêng, app hiện thông báo thay vì ghi đè.
- **Một phiên kéo lớn (148):** lần đầu có thể hàng nghìn bản ghi; kéo theo trang `limit`, ghi vào Room từng lô trong giao dịch và lưu `lastPulledRev` sau mỗi lô để tiếp tục khi bị gián đoạn.
- **Chuyển tài khoản trên cùng máy:** mỗi tài khoản dùng **tệp Room riêng** nên đổi tài khoản là mở tệp khác, không trộn dữ liệu. Khi người dùng đăng nhập tài khoản đang có dữ liệu cục bộ chưa đồng bộ từ chế độ không tài khoản, hỏi: gộp vào tài khoản này hay giữ riêng.
- **Đăng ký nhiều bước (137):** mật khẩu chỉ giữ trong bộ nhớ, **không lưu vào bản nháp `RegistrationDraft`**; thoát giữa chừng thì lần sau chỉ cần nhập lại mật khẩu. Phòng tạo hàng loạt đặt tên theo mẫu (ví dụ dãy A, tầng 1 → A101, A102...), cho xem trước và sửa trước khi gửi. Gửi lỗi giữa chừng (mất mạng) thì giữ nguyên bản nháp để thử lại, và dùng `idempotencyKey` để bấm lại không tạo hai nhà trọ.
- **Chế độ không tài khoản (145):** dữ liệu tạo trước khi đăng ký được đánh dấu chưa đồng bộ và đẩy lên lần đầu sau khi đăng nhập; kiểm tra trùng nhà trọ nếu tài khoản đã có dữ liệu.
- **Token và phiên (144):** làm mới token **một luồng duy nhất** (nhiều yêu cầu cùng gặp 401 chỉ gọi làm mới một lần). Token chỉ ở trong bộ nhớ nên khi hết phiên hoặc app bị đóng, **dữ liệu của tài khoản trong Room không được mở** cho đến khi đăng nhập lại; **thay đổi chưa đồng bộ vẫn nằm trong hàng đợi** và được gửi sau khi đăng nhập. Làm mới thất bại do phiên bị thu hồi thì hiện màn hình đăng nhập, **không xóa dữ liệu trên máy**. Khi hết phiên đang nhập dở một biểu mẫu thì giữ bản nháp trong bộ nhớ để người dùng đăng nhập xong làm tiếp.
- **Xóa tài khoản (143):** sau khi máy chủ xác nhận, hỏi giữ hay xóa dữ liệu trên máy; xóa luôn hàng đợi gửi và token.
- **Mật khẩu:** không bao giờ lưu, không ghi log, không đưa vào tệp xuất hay báo lỗi. Kiểm tra độ mạnh ở app chỉ để gợi ý; máy chủ mới là nơi quyết định.
- **Lỗi mạng (155):** phân biệt trong mã các nguyên nhân (không có mạng, quá thời gian chờ, không phân giải được máy chủ, lỗi chứng chỉ, 5xx) nhưng hiển thị thông báo gọn cho người dùng. Đặt thời gian chờ hợp lý (ví dụ 15 giây) và không thử lại vô hạn. Màn hình đăng nhập khi mất mạng phải hiện lỗi chứ không quay mãi.
- **Đa ngôn ngữ (159):** mọi chuỗi giao diện nằm trong tệp tài nguyên (`values` và `values-vi`, `values-en`), **không viết cứng chuỗi trong mã**; dùng `plurals` cho số nhiều và tham số có thứ tự (`%1$s`) vì thứ tự từ khác nhau giữa các ngôn ngữ. Đổi ngôn ngữ bằng cơ chế ngôn ngữ theo từng ứng dụng của hệ thống để không phải khởi động lại. **Nội dung người dùng nhập** (tên khách, ghi chú, điều khoản hợp đồng, nội quy) **không bị dịch**. Mẫu tin nhắn và mẫu hợp đồng soạn sẵn cần có bản cho từng ngôn ngữ; bản người dùng đã sửa giữ nguyên. Tiền vẫn là đồng nguyên, chỉ đổi cách phân cách hàng nghìn. Máy chủ trả **mã lỗi ổn định** (`code`) và app tự dịch, không hiển thị chuỗi lỗi thô của máy chủ. Tìm không dấu vẫn chuẩn hóa như cũ ở mọi ngôn ngữ. Kiểm tra chuỗi dài (tiếng Anh thường dài hơn) không bị cắt trên màn hình nhỏ.
- **Kiểm thử:** dùng máy chủ giả (mock) để thử các tình huống mất mạng giữa chừng, 401, 409 xung đột, 5xx, phản hồi chậm; thử hai thiết bị cùng sửa một phòng.

## Cách dùng thực tế khi có tài khoản và máy chủ

- **Đăng nhập lại khi hết phiên:** chuyển sang Zalo rồi quay lại thì app vẫn sống; chỉ khi để ở nền quá khoảng 1 giờ hoặc thoát hẳn app mới phải đăng nhập lại. Cần có mạng để đăng nhập; **không có mạng thì hiện thông báo lỗi mạng** và không mở được dữ liệu của tài khoản (chỉ chế độ không tài khoản dùng được offline). Với chủ trọ ở nơi sóng yếu đây là bất tiện thật.
- **Hai chế độ:** dùng không tài khoản (chỉ trên máy, như bản offline) hoặc có tài khoản (đồng bộ qua máy chủ).
- **Nhiều thiết bị dùng chung dữ liệu** (máy chủ trọ và máy người quản lý đi ghi chỉ số), nhưng **không phải thời gian thực**: đồng bộ khi mở app hoặc khi bấm nút. Chỉ số nhập ở máy này chỉ hiện ở máy kia sau khi cả hai đã đồng bộ.
- **Khách thuê vẫn không dùng app.** Mọi thứ gửi cho khách vẫn qua tin nhắn do chủ trọ soạn và gửi.
- **Không có thông báo đẩy** nên vẫn cần mở app đầu ngày và xem "Hôm nay".
- **Sao lưu:** dữ liệu nằm trên máy chủ nên đổi máy chỉ cần đăng nhập. Nhưng độ an toàn của bản sao lưu phụ thuộc vào cách **bạn vận hành máy chủ**; hãy sao lưu máy chủ định kỳ. Tệp xuất vẫn là bản dự phòng thứ hai.
- **Máy chủ là chi phí và trách nhiệm vận hành của bạn:** thuê máy chủ, theo dõi lỗi, vá bảo mật, trả lời yêu cầu xóa dữ liệu. Nếu máy chủ ngừng, app vẫn dùng được offline nhưng không đồng bộ được.
- Ai biết email và mật khẩu của tài khoản đều xem được toàn bộ dữ liệu khách thuê; nên dùng mật khẩu mạnh và không dùng chung tài khoản, hãy dùng tính năng mời người quản lý (154).

## Hệ quả khi áp các quy tắc của bạn

- **Không sổ nợ:** đây là đánh đổi lớn nhất với nhà trọ. App chỉ có trạng thái thu theo từng kỳ; nếu khách nợ nhiều tháng, chủ trọ phải tự theo dõi ngoài app hoặc nhập tay vào điều chỉnh. Đã giải thích ở đầu file.
- **Không hóa đơn/thuế:** bảng kê, biên bản bàn giao, mẫu hợp đồng và bảng lương chỉ là tài liệu nội bộ. Nếu nhà trọ thuộc diện phải xuất hóa đơn hay kê khai thuế thì chủ trọ làm ngoài app.
- **Không ảnh:** không có ảnh phòng, ảnh tình trạng khi bàn giao, ảnh đồng hồ điện nước. Tình trạng ghi bằng chữ và ô "khách xác nhận". Muốn có bằng chứng ảnh thì lưu ngoài app.
- **Không thông báo:** nhắc thu tiền, chốt số, hết hạn hợp đồng chỉ hiện khi mở app.
- **Không quét mã vạch/QR:** phòng và công tơ tìm bằng tên và số công tơ.
- **Không khóa app (PIN, sinh trắc học):** vẫn không có. Nhưng đăng nhập tài khoản nghĩa là app phải lưu token an toàn và máy chủ phải bảo vệ dữ liệu; đây là phần bắt buộc của việc dùng API, không phải tính năng bảo mật thêm cho người dùng cuối.
- **Không còn "không xin quyền nào":** cần quyền `INTERNET`; vẫn không có quyền runtime.
- **Không còn "dữ liệu chỉ trên máy":** khi đăng nhập, dữ liệu khách thuê nằm trên máy chủ của bạn. Đây là thay đổi lớn nhất về trách nhiệm.

## Lưu ý khi đăng Google Play

- **Chỉ khai quyền `INTERNET`** (và `ACCESS_NETWORK_STATE` nếu dùng). Không quyền runtime nào. Kiểm tra lại file Manifest sau khi build để chắc không có quyền do thư viện kéo vào.
- Category **House & Home** hoặc **Business**. Mô tả xoay quanh "quản lý phòng trọ, hợp đồng, chỉ số điện nước, tính tiền hằng tháng, bàn giao phòng". Viết rõ đây là app **dành cho chủ trọ**, không phải app để khách thuê xem tiền hay thanh toán.
- **Không viết "thanh toán online", "xuất hóa đơn", "nhắc tự động", "kết nối ngân hàng", "khai báo tạm trú tự động", "tư vấn pháp lý",** vì app không làm các việc này.
- **Không dùng tên thương hiệu** nhà trọ, nhà cung cấp điện nước, ngân hàng hay ví điện tử trong mô tả, tiêu đề, ảnh chụp màn hình và ví dụ. Dùng ví dụ chung như "Phòng 101", "Khách A", "Dãy A".
- Dữ liệu gồm tên, SĐT người thuê, liên hệ khẩn cấp, số xe (chữ). Không lưu CCCD hay giấy tờ. **Khai Data safety theo thực tế:** có thu thập thông tin cá nhân (email, tên, SĐT của người thuê do chủ trọ nhập), dữ liệu được **truyền đi và lưu trên máy chủ**, có **cơ chế yêu cầu xóa dữ liệu**. Khai "mã hóa khi truyền" chỉ khi mọi kết nối đều qua HTTPS. Phải có chính sách quyền riêng tư công khai và đường dẫn xóa tài khoản. Chế độ không tài khoản không gửi dữ liệu đi, nhưng khai báo vẫn phải phản ánh trường hợp có tài khoản.
- Mẫu hợp đồng và nội quy chỉ là văn bản gợi ý. Nên ghi trong app: "nội dung do bạn tự soạn và tự chịu trách nhiệm; kiểm tra quy định tại địa phương".
- Phần nhắc khách chỉ **soạn sẵn tin nhắn**. App không tự gửi tin.
- Không ghi "bảo mật tuyệt đối" hay "mã hóa" nếu chưa kiểm chứng; chỉ nêu những gì thực sự làm (ví dụ "kết nối qua HTTPS").

---

## Nội dung gợi ý cho trang cửa hàng Google Play

**Ngôn ngữ trang cửa hàng:** soạn bản tiếng Việt và tiếng Anh (và các ngôn ngữ khác nếu app hỗ trợ), vì Play Console cho nhập mô tả riêng cho từng ngôn ngữ.

**Tên (tối đa 30 ký tự):** RoomKeep: Rental Room Manager *(chỉnh theo tên cuối cùng bạn chọn)*

**Mô tả ngắn (tối đa 80 ký tự):**
Quản lý phòng trọ, hợp đồng, điện nước, tiền thuê. Dùng offline, đồng bộ khi đăng nhập.

**Mô tả đầy đủ (tiếng Việt):**

RoomKeep giúp chủ nhà trọ quản lý phòng, khách thuê, hợp đồng, chỉ số điện nước và tiền thu hằng tháng ngay trên điện thoại. Dùng được ngay không cần tài khoản và không cần mạng; khi đăng nhập, dữ liệu được đồng bộ qua máy chủ để dùng trên nhiều thiết bị. App không xin quyền runtime nào.

Phòng và khách thuê
• Sơ đồ phòng theo dãy và tầng, trạng thái trống, đang thuê, giữ chỗ, đang sửa
• Hồ sơ khách, nhiều người ở một phòng, lịch sử thuê
• Danh sách phòng trống lâu, giá thuê hiệu lực theo thời điểm

Hợp đồng
• Tạo, gia hạn, chuyển phòng, chấm dứt trước hạn
• Tiền cọc, phụ phí cố định, mẫu hợp đồng soạn sẵn để bạn tự sửa
• Danh sách hợp đồng sắp hết hạn

Điện nước và tính tiền
• Nhập chỉ số theo tầng, tự tính tiêu thụ, giá điện bậc thang, nước theo m³ hoặc đầu người
• Cảnh báo chỉ số bất thường, thay công tơ
• Tạo bảng tính tiền cả tháng cho tất cả phòng, tính theo ngày khi khách vào hoặc ra giữa tháng
• Bảng kê chi tiết để gửi khách xem, trạng thái thu theo từng kỳ

Bàn giao và sửa chữa
• Biên bản bàn giao khi vào và khi trả phòng, trừ cọc theo hư hỏng
• Yêu cầu sửa chữa, danh bạ thợ, lịch bảo trì, lịch sử sửa theo phòng

Tài khoản và đồng bộ
• Đăng ký tài khoản kèm thông tin nhà trọ, đăng nhập, đổi và đặt lại mật khẩu, xóa tài khoản ngay trong ứng dụng
• Giao diện tiếng Việt và English, đổi ngôn ngữ ngay trong cài đặt
• Đồng bộ nhiều thiết bị, tự xếp hàng thay đổi khi mất mạng, màn hình xử lý xung đột
• Mời người quản lý vào cùng nhà trọ, xem và đăng xuất các thiết bị đã đăng nhập

Số liệu giúp bạn quyết định
• Tỷ lệ lấp đầy, lợi nhuận theo phòng, chênh lệch điện nước tổng và tiền thu
• Dự báo phòng trống 60 ngày và doanh thu 3 tháng tới (ước tính)

Dành cho chủ trọ: dữ liệu do bạn hoặc người quản lý nhập, khách thuê không dùng ứng dụng. Đồng bộ chỉ chạy khi bạn mở ứng dụng và đã đăng nhập. Ứng dụng không xuất hóa đơn, không theo dõi công nợ cộng dồn và không tư vấn pháp lý; bảng kê chỉ là tài liệu nội bộ. Nhắc việc hiển thị trong ứng dụng khi bạn mở lên. Xuất và nhập dữ liệu qua tệp để chuyển sang máy khác hoặc làm bản dự phòng, nên hãy xuất tệp thường xuyên.

Giao diện sáng và tối. Tên nhà trọ của bạn hiển thị trong ứng dụng và trên bảng kê.

**Short description (EN, 80 chars):**
Rooms, tenants, contracts, meter readings and rent for landlords. Offline, optional sync.

**Full description (EN, tóm tắt):** viết tương ứng nội dung bản tiếng Việt, nhấn mạnh: "for landlords, data is entered by the owner or manager", "no invoices, no cumulative debt tracking, no legal advice", "works offline", "optional account with cloud sync", "no runtime permissions".

---
