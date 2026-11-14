/**
 * Public privacy policy page (Google Play requirement): GET /privacy (?lang=en).
 * The text describes what this API actually stores; keep it in sync when data handling changes.
 * Owner and contact come from PRIVACY_OWNER / PRIVACY_EMAIL (defaults below).
 */
const express = require('express');
const config = require('../config');
const { langOf } = require('../i18n');

const OWNER = process.env.PRIVACY_OWNER || 'Pham Dung';
const EMAIL = process.env.PRIVACY_EMAIL || '2631phamvandung@gmail.com';
const UPDATED = '2026-11-15';

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const base = () => config.publicBaseUrl || '';
const mail = `<a href="mailto:${esc(EMAIL)}">${esc(EMAIL)}</a>`;

/** [heading, [paragraph | list items array]] */
const content = {
  vi: {
    title: 'Chính sách quyền riêng tư RoomKeep',
    updated: `Cập nhật lần cuối: 15/11/2026`,
    other: '<a href="?lang=en">English</a>',
    sections: [
      ['Chúng tôi là ai', [
        `RoomKeep là ứng dụng quản lý nhà trọ, phòng cho thuê do <strong>${esc(OWNER)}</strong> phát triển và chịu trách nhiệm về dữ liệu. Liên hệ: ${mail}.`,
      ]],
      ['Hai cách dùng ứng dụng', [
        '<strong>Không tài khoản:</strong> mọi dữ liệu chỉ lưu trên điện thoại của bạn, không gửi lên máy chủ của chúng tôi.',
        '<strong>Có tài khoản:</strong> dữ liệu được đồng bộ lên máy chủ để dùng trên nhiều thiết bị và khôi phục khi đổi máy. Phần dưới đây mô tả dữ liệu trong trường hợp này.',
      ]],
      ['Dữ liệu chúng tôi lưu', [[
        '<strong>Tài khoản:</strong> email, tên hiển thị, ngôn ngữ ưa thích, mật khẩu (chỉ lưu dạng đã băm bằng bcrypt, không ai đọc được mật khẩu gốc), thời điểm đồng ý điều khoản.',
        '<strong>Nhà trọ:</strong> tên, địa chỉ, số điện thoại chủ trọ và các cài đặt thu tiền.',
        '<strong>Dữ liệu quản lý do chủ trọ hoặc người quản lý nhập:</strong> phòng, khách thuê (tên, số điện thoại, nơi làm việc, số xe, người liên hệ khẩn cấp, ghi chú), hợp đồng, chỉ số điện nước, bảng tính tiền, các lần thu, tiền cọc, sửa chữa, chi phí, nhân sự và các ghi chép khác trong ứng dụng.',
        '<strong>Phiên đăng nhập:</strong> tên thiết bị do ứng dụng gửi, thời điểm đăng nhập và hoạt động gần nhất, để bạn xem và đăng xuất thiết bị từ xa.',
        '<strong>Dữ liệu kỹ thuật:</strong> địa chỉ IP được lưu tạm để chống truy cập dồn dập và tự xóa sau tối đa khoảng 2 ngày; nhật ký máy chủ chỉ ghi loại yêu cầu, đường dẫn, mã kết quả và thời gian xử lý, không ghi nội dung, mật khẩu hay mã truy cập.',
      ]]],
      ['Dữ liệu chúng tôi không thu thập', [
        'Ứng dụng không dùng camera, ảnh, vị trí, danh bạ hay micro, không có quảng cáo và không bán hoặc cho thuê dữ liệu. Ứng dụng không tự gửi tin nhắn và không thu tiền thay bạn.',
      ]],
      ['Mục đích sử dụng', [[
        'Tạo và quản lý tài khoản, đăng nhập, giữ phiên làm việc.',
        'Đồng bộ dữ liệu giữa các thiết bị của bạn và của người quản lý bạn mời.',
        'Gửi email cần thiết: mã đặt lại mật khẩu và thông báo khi mật khẩu được thay đổi. Chúng tôi không gửi email quảng cáo.',
        'Bảo vệ tài khoản: giới hạn số lần đăng nhập sai, phát hiện phiên bị lộ.',
      ]]],
      ['Ai xem được dữ liệu', [[
        'Chỉ tài khoản thuộc cùng nhà trọ: chủ trọ và người quản lý được chủ trọ mời. Người quản lý không xem được lợi nhuận, lương và chi phí tổng.',
        'Nhà cung cấp hạ tầng xử lý dữ liệu thay chúng tôi: MongoDB Atlas (cơ sở dữ liệu), Vercel (máy chủ API) và Google Gmail (gửi email). Họ không được dùng dữ liệu cho mục đích riêng.',
        'Chúng tôi chỉ cung cấp dữ liệu cho cơ quan nhà nước khi pháp luật yêu cầu.',
      ]]],
      ['Dữ liệu của khách thuê', [
        'Thông tin khách thuê do chủ trọ nhập và chủ trọ chịu trách nhiệm có sự đồng ý của khách. Khách thuê muốn xem, sửa hoặc xóa thông tin của mình hãy liên hệ chủ trọ; nếu cần, có thể liên hệ chúng tôi qua email ở trên.',
      ]],
      ['Bảo mật', [
        'Mọi kết nối dùng HTTPS. Mật khẩu chỉ lưu dạng băm. Mã truy cập chỉ nằm trong bộ nhớ ứng dụng, có hạn dùng và thu hồi được. Máy chủ luôn kiểm tra quyền theo nhà trọ ở mỗi yêu cầu. Không có hệ thống nào an toàn tuyệt đối; hãy dùng mật khẩu mạnh và không dùng chung tài khoản.',
      ]],
      ['Thời gian lưu và xóa dữ liệu', [[
        'Dữ liệu được giữ trong thời gian tài khoản còn tồn tại.',
        'Bản ghi bạn xóa trong ứng dụng được đánh dấu xóa để đồng bộ sang các thiết bị khác, rồi xóa hẳn sau 90 ngày.',
        'Mã đặt lại mật khẩu hết hạn sau 30 phút, mã mời sau 48 giờ, phiên đăng nhập tối đa 12 giờ; các bản ghi này tự xóa sau đó.',
        `Bạn có thể xóa tài khoản ngay trong ứng dụng (Cài đặt &gt; Tài khoản &gt; Xóa tài khoản) hoặc tại <a href="${base()}/account/delete">trang xóa tài khoản</a>. Nếu bạn là chủ trọ, toàn bộ dữ liệu nhà trọ trên máy chủ bị xóa ngay và không khôi phục được. Dữ liệu chỉ lưu trên điện thoại không bị ảnh hưởng.`,
      ]]],
      ['Quyền của bạn', [
        `Bạn có quyền xem, sửa (trong ứng dụng), xuất dữ liệu (tính năng xuất/nhập), xóa dữ liệu và rút lại đồng ý bằng cách xóa tài khoản, theo quy định pháp luật về bảo vệ dữ liệu cá nhân. Mọi yêu cầu khác xin gửi về ${mail}; chúng tôi trả lời trong thời hạn pháp luật quy định.`,
      ]],
      ['Trẻ em', [
        'Ứng dụng dành cho người kinh doanh nhà trọ, không dành cho trẻ em dưới 16 tuổi và không cố ý thu thập dữ liệu của trẻ em.',
      ]],
      ['Thay đổi chính sách', [
        'Khi chính sách thay đổi, chúng tôi cập nhật trang này và ngày cập nhật ở đầu trang. Thay đổi quan trọng sẽ được thông báo trong ứng dụng.',
      ]],
    ],
  },
  en: {
    title: 'RoomKeep Privacy Policy',
    updated: `Last updated: ${UPDATED}`,
    other: '<a href="?lang=vi">Tiếng Việt</a>',
    sections: [
      ['Who we are', [
        `RoomKeep is a rental-property management app developed by <strong>${esc(OWNER)}</strong>, who is responsible for the data. Contact: ${mail}.`,
      ]],
      ['Two ways to use the app', [
        '<strong>Without an account:</strong> all data stays on your phone and is never sent to our server.',
        '<strong>With an account:</strong> data is synced to our server so you can use several devices and restore it on a new phone. The rest of this policy describes that case.',
      ]],
      ['Data we store', [[
        '<strong>Account:</strong> email, display name, preferred language, password (stored only as a bcrypt hash; nobody can read the original), time you accepted the terms.',
        '<strong>Property:</strong> name, address, owner phone number and billing settings.',
        '<strong>Management data entered by the owner or managers:</strong> rooms, tenants (name, phone number, workplace, vehicle plate, emergency contact, notes), contracts, meter readings, statements, payments, deposits, repairs, expenses, staff and other records in the app.',
        '<strong>Sessions:</strong> the device name sent by the app, sign-in and last-activity times, so you can review devices and sign them out remotely.',
        '<strong>Technical data:</strong> IP addresses are kept briefly to prevent abuse and deleted automatically within about 2 days; server logs record only the request type, path, result code and duration, never content, passwords or tokens.',
      ]]],
      ['Data we do not collect', [
        'The app does not use the camera, photos, location, contacts or microphone, shows no ads, and we never sell or rent data. The app does not send messages on your behalf or collect money for you.',
      ]],
      ['How we use data', [[
        'To create and manage your account, sign you in and keep your session.',
        'To sync data between your devices and those of the managers you invite.',
        'To send necessary emails: password reset codes and notices when your password changes. We send no marketing email.',
        'To protect accounts: limiting failed sign-ins and detecting leaked sessions.',
      ]]],
      ['Who can see the data', [[
        'Only accounts of the same property: the owner and the managers the owner invites. Managers cannot see profit, salaries or total costs.',
        'Infrastructure providers processing data on our behalf: MongoDB Atlas (database), Vercel (API hosting) and Google Gmail (email delivery). They may not use the data for their own purposes.',
        'Authorities, only when required by law.',
      ]]],
      ['Tenant data', [
        'Tenant information is entered by the property owner, who is responsible for having the tenants\' consent. Tenants who want to see, correct or delete their information should contact the owner; if needed, they can also contact us at the email above.',
      ]],
      ['Security', [
        'All connections use HTTPS. Passwords are stored only as hashes. Access tokens live only in the app\'s memory, expire and can be revoked. The server checks property access on every request. No system is perfectly secure; please use a strong password and do not share accounts.',
      ]],
      ['Retention and deletion', [[
        'Data is kept while the account exists.',
        'Records you delete in the app are marked as deleted so other devices receive the deletion, then permanently removed after 90 days.',
        'Password reset codes expire after 30 minutes, invite codes after 48 hours, sessions after at most 12 hours; these records are then removed automatically.',
        `You can delete your account in the app (Settings &gt; Account &gt; Delete account) or on the <a href="${base()}/account/delete?lang=en">account deletion page</a>. If you are the owner, all property data on the server is deleted immediately and cannot be recovered. Data stored only on your phone is not affected.`,
      ]]],
      ['Your rights', [
        `You can access and correct your data in the app, export it (export/import feature), delete it and withdraw consent by deleting the account, as provided by applicable data protection law. For any other request, write to ${mail}; we reply within the time required by law.`,
      ]],
      ['Children', [
        'The app is meant for people running rental properties, not for children under 16, and we do not knowingly collect children\'s data.',
      ]],
      ['Changes', [
        'When this policy changes we update this page and the date at the top. Important changes will be announced in the app.',
      ]],
    ],
  },
};

function render(lang) {
  const t = content[lang];
  const body = t.sections.map(([h, parts]) => `<h2>${h}</h2>${parts.map((p) => (Array.isArray(p) ? `<ul>${p.map((li) => `<li>${li}</li>`).join('')}</ul>` : `<p>${p}</p>`)).join('')}`).join('\n');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.title}</title>
<style>
:root{--bg:#f7f7f5;--fg:#1d1d1b;--muted:#5d5d58;--card:#fff;--line:#d9d9d4;--accent:#1f5f4a}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecece8;--muted:#a5a59f;--card:#20201e;--line:#3a3a37;--accent:#8fd1b5}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 48px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}
h1{font-size:24px;margin:0 0 4px;color:var(--accent)}h2{font-size:18px;margin:28px 0 8px}
.meta{color:var(--muted);font-size:14px;margin:0 0 8px}p,li{margin:0 0 10px}ul{padding-left:20px;margin:0}
a{color:var(--accent)}nav{margin-top:16px;font-size:14px}
</style></head><body><main><div class="card">
<h1>${t.title}</h1><p class="meta">${t.updated}</p>
${body}
</div><nav>${t.other}</nav></main></body></html>`;
}

const pickLang = (req) => (req.query.lang === 'en' || req.query.lang === 'vi' ? req.query.lang : langOf(req.get('accept-language')));

const router = express.Router();
router.get('/privacy', (req, res) => res.type('html').send(render(pickLang(req))));

module.exports = router;
