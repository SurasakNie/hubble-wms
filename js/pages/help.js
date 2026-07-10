import { isAdmin, isManager, isClientRole } from '../auth.js';

let _admin   = false;
let _manager = false;
let _client  = false;
let _tab     = 'user';
let _lang    = 'en';

export async function render(profile) {
  _admin   = isAdmin();
  _manager = isManager();
  _client  = isClientRole();

  document.getElementById('topbar-left').innerHTML =
    `<span class="topbar-title">Help</span>`;

  document.getElementById('content').innerHTML = `
    <style>#help-content .card strong{font-weight:400;}</style>
    <div style="padding:var(--sp-4);">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:var(--sp-2);">
        <div class="tabs-secondary" id="help-tabs">
          <button class="tab-btn active" data-tab="user" id="help-tab-user">User Guide</button>
          ${_admin ? `<button class="tab-btn" data-tab="admin" id="help-tab-admin">Admin Guide</button>` : ''}
        </div>
        <div style="display:flex;gap:2px;padding-bottom:var(--sp-1);">
          <button class="tab-btn${_lang === 'en' ? ' active' : ''}" id="help-lang-en">EN</button>
          <button class="tab-btn${_lang === 'th' ? ' active' : ''}" id="help-lang-th">TH</button>
        </div>
      </div>
      <div id="help-content"></div>
    </div>
  `;

  _renderTab(_tab);
  _wireEvents();
}

function _wireEvents() {
  document.querySelectorAll('#help-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      document.querySelectorAll('#help-tabs .tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === _tab));
      _renderTab(_tab);
    });
  });

  document.getElementById('help-lang-en').addEventListener('click', () => _setLang('en'));
  document.getElementById('help-lang-th').addEventListener('click', () => _setLang('th'));
}

function _setLang(lang) {
  _lang = lang;
  document.getElementById('help-lang-en').classList.toggle('active', lang === 'en');
  document.getElementById('help-lang-th').classList.toggle('active', lang === 'th');
  const userTab = document.getElementById('help-tab-user');
  if (userTab) userTab.textContent = lang === 'th' ? 'คู่มือผู้ใช้' : 'User Guide';
  const adminTab = document.getElementById('help-tab-admin');
  if (adminTab) adminTab.textContent = lang === 'th' ? 'คู่มือผู้ดูแล' : 'Admin Guide';
  _renderTab(_tab);
}

function _item(en, th) {
  return `
    <div class="help-item" style="margin-bottom:var(--sp-3);">
      <p style="margin:0;">${_lang === 'th' ? th : en}</p>
    </div>`;
}

function _section(enTitle, thTitle, items) {
  return `
    <div class="section-header" style="margin-top:var(--sp-5);">
      <span style="color:var(--accent);font-weight:600;">${_lang === 'th' ? thTitle : enTitle}</span>
    </div>
    <div class="card" style="padding:var(--sp-4);margin-top:var(--sp-3);color:var(--text-muted);">
      ${items}
    </div>`;
}

function _renderTab(tab) {
  const el = document.getElementById('help-content');
  if (tab === 'user') el.innerHTML = _userGuide();
  else if (tab === 'admin') el.innerHTML = _adminGuide();
}

function _userGuide() {
  const s1 = _section('Getting Started', 'เริ่มต้นใช้งาน', [
    _item('Log in with your Employee ID (<code>DD-T-NNN-CC</code>) and your password.',
          'เข้าสู่ระบบด้วยรหัสพนักงาน (<code>DD-T-NNN-CC</code>) และรหัสผ่านของคุณ'),
    _item('<strong>First login:</strong> A forced password-change screen appears. Set a new password to continue.',
          '<strong>เข้าสู่ระบบครั้งแรก:</strong> หน้าจอบังคับเปลี่ยนรหัสผ่านจะปรากฏขึ้น ตั้งรหัสผ่านใหม่เพื่อดำเนินการต่อ'),
    _item('<strong>Two-factor authentication (2FA):</strong> Optional. After the password change an enrollment screen appears — scan the QR code or enter the secret key, or press <em>Skip</em> to set it up later.',
          '<strong>การยืนยันตัวตนสองชั้น (2FA):</strong> ไม่บังคับ หลังเปลี่ยนรหัสผ่านจะมีหน้าจอลงทะเบียน — สแกน QR หรือกรอกรหัสลับ หรือกด <em>ข้าม</em> เพื่อตั้งค่าภายหลัง'),
    _item('Default page after login: <strong>Calendar</strong>.',
          'หน้าเริ่มต้นหลังเข้าสู่ระบบ: <strong>ปฏิทิน</strong>'),
    _item('Work is backed up nightly at 1:00 AM. Work saved after that appears in the following night\'s backup.',
          'ข้อมูลสำรองทุกคืนเวลา 01:00 น. งานที่บันทึกหลังเวลาดังกล่าวจะปรากฏในการสำรองคืนถัดไป'),
  ].join(''));

  const s2 = _section('Daily Use', 'การใช้งานประจำวัน', [
    _item('<strong>Calendar</strong> — View your schedule and log time entries.',
          '<strong>ปฏิทิน</strong> — ดูตารางงานและบันทึกเวลาทำงาน'),
    _item('<strong>Timesheet</strong> — Weekly time log. Submit each week for manager approval.',
          '<strong>ใบบันทึกเวลา</strong> — บันทึกเวลารายสัปดาห์ ส่งทุกสัปดาห์เพื่อขออนุมัติจากผู้จัดการ'),
    _item('<strong>Leave & Holidays</strong> — Apply for leave, WFH days, and flex-time swaps.',
          '<strong>วันหยุดและการลา</strong> — ยื่นขอลา วันทำงานจากบ้าน และเปลี่ยนเวลางานยืดหยุ่น'),
    _item('<strong>Expenses</strong> — Submit petty cash claims, mileage, and travel requests.',
          '<strong>ค่าใช้จ่าย</strong> — ยื่นเบิกเงินสดย่อย ค่าเดินทาง และค่าเดินทางไกล'),
    _item('<strong>Documents</strong> — Request an Employment Certificate and view documents issued to you.',
          '<strong>เอกสาร</strong> — ขอหนังสือรับรองการทำงานและดูเอกสารที่ออกให้คุณ'),
    _item('<strong>Evaluation</strong> — Complete your self-assessment when an evaluation cycle is open (H1 / H2).',
          '<strong>การประเมิน</strong> — กรอกแบบประเมินตนเองเมื่อเปิดรอบการประเมิน (H1 / H2)'),
    _item('<strong>Part Numbers</strong> — On the <code>#part-numbers</code> page, mint a part number for an item in one of your projects. Each number follows <code>CCC-PPP-CAT-SEQ</code> (client code, project code, 3-letter category, sequence). Pick a category from the list — the help text shown under the picker explains what each category covers. Once minted, you can bump a revision with a note, and use <strong>Compare</strong> to see what changed between two revisions.',
          '<strong>เลขชิ้นส่วน (Part Numbers)</strong> — ที่หน้า <code>#part-numbers</code> คุณสามารถออกเลขชิ้นส่วนให้กับรายการในโครงการของคุณได้ รูปแบบเลขคือ <code>CCC-PPP-CAT-SEQ</code> (รหัสลูกค้า รหัสโครงการ หมวดหมู่ 3 ตัวอักษร ลำดับ) เลือกหมวดหมู่จากรายการ — ข้อความช่วยเหลือที่แสดงใต้ตัวเลือกจะอธิบายว่าแต่ละหมวดครอบคลุมอะไรบ้าง เมื่อออกเลขแล้ว คุณสามารถอัปเดตรีวิชันพร้อมบันทึกหมายเหตุ และใช้ <strong>Compare</strong> เพื่อดูความแตกต่างระหว่างสองรีวิชัน'),
    _item('<strong>Two-step leave approval</strong> — Some leave types need two approvals: your direct manager first, then HR/admin gives the final sign-off. If your request shows status <strong>Manager Approved</strong>, it has passed the first step but is not final yet — no action is needed from you; it will move to <strong>Approved</strong> once HR completes the second step.',
          '<strong>การอนุมัติวันลาสองขั้นตอน</strong> — วันลาบางประเภทต้องผ่านการอนุมัติสองขั้นตอน: ผู้จัดการโดยตรงก่อน จากนั้น HR/ผู้ดูแลระบบจะอนุมัติขั้นสุดท้าย หากคำขอของคุณแสดงสถานะ <strong>Manager Approved</strong> แปลว่าผ่านขั้นตอนแรกแล้วแต่ยังไม่ใช่ขั้นสุดท้าย คุณไม่ต้องทำอะไรเพิ่มเติม ระบบจะเปลี่ยนเป็น <strong>Approved</strong> เมื่อ HR อนุมัติขั้นตอนที่สองเสร็จสิ้น'),
  ].join(''));

  const s3 = (_manager || _admin) ? _section('Approvals', 'การอนุมัติ', [
    _item('<strong>Holidays page</strong> — Approve or reject pending leave requests from your team.',
          '<strong>หน้าวันหยุด</strong> — อนุมัติหรือปฏิเสธคำขอลาของทีม'),
    _item('<strong>Expenses → Approvals tab</strong> — Approve expense claims, mileage, travel requests, and settlements.',
          '<strong>ค่าใช้จ่าย → แท็บการอนุมัติ</strong> — อนุมัติใบเบิกค่าใช้จ่าย ค่าเดินทาง และการชำระบัญชี'),
    _item('<strong>Requests page</strong> — Approve name-change and job-title-change requests.',
          '<strong>หน้าคำขอ</strong> — อนุมัติคำขอเปลี่ยนชื่อและตำแหน่งงาน'),
    _item('<strong>Documents → REQUESTS tab</strong> — Fulfill Employment Certificate requests (opens GENERATE pre-filled).',
          '<strong>เอกสาร → แท็บคำขอ</strong> — ดำเนินการออกหนังสือรับรองการทำงาน (เปิดหน้า GENERATE พร้อมข้อมูล)'),
    _item('<strong>Evaluation → TEAM REVIEW tab</strong> — Complete the manager review for each team member.',
          '<strong>การประเมิน → แท็บ TEAM REVIEW</strong> — กรอกแบบประเมินของผู้จัดการสำหรับสมาชิกแต่ละคน'),
  ].join('')) : '';

  const s4 = _section('Account & Security', 'บัญชีและความปลอดภัย', [
    _item('Change your password: click your avatar (top-right) → <strong>Preferences</strong> → <strong>Security</strong> tab → <em>Change Password</em>.',
          'เปลี่ยนรหัสผ่าน: คลิกรูปโปรไฟล์ (มุมบนขวา) → <strong>การตั้งค่า</strong> → แท็บ <strong>ความปลอดภัย</strong> → <em>เปลี่ยนรหัสผ่าน</em>'),
    _item('Enable or disable 2FA: <strong>Preferences → Security → 2FA section</strong>.',
          'เปิด/ปิด 2FA: <strong>การตั้งค่า → ความปลอดภัย → ส่วน 2FA</strong>'),
    _item('Link your Google account for one-click sign-in: <strong>Preferences → Security → Link Google</strong>.',
          'เชื่อมบัญชี Google เพื่อเข้าสู่ระบบด้วยคลิกเดียว: <strong>การตั้งค่า → ความปลอดภัย → เชื่อมต่อ Google</strong>'),
    _item('If you are locked out: contact your admin to reset your password or clear your 2FA.',
          'หากถูกล็อกออก: ติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่านหรือล้างค่า 2FA'),
  ].join(''));

  return s1 + s2 + s3 + s4;
}

function _adminGuide() {
  const s1 = _section('Employee Management', 'การจัดการพนักงาน', [
    _item('<strong>Directory tab</strong> — Add, edit, provision, and reset employee accounts.',
          '<strong>แท็บไดเรกทอรี</strong> — เพิ่ม แก้ไข จัดสรร และรีเซ็ตบัญชีพนักงาน'),
    _item('<strong>Provision Account</strong> — Select an employee → Provision Account → temporary password is shown once.',
          '<strong>จัดสรรบัญชี</strong> — เลือกพนักงาน → จัดสรรบัญชี → รหัสผ่านชั่วคราวแสดงครั้งเดียว'),
    _item('<strong>Reset Password</strong> — Employee modal → Reset Password → new temporary password shown once (forces change on next login).',
          '<strong>รีเซ็ตรหัสผ่าน</strong> — หน้าต่างพนักงาน → รีเซ็ตรหัสผ่าน → รหัสผ่านชั่วคราวใหม่แสดงครั้งเดียว (บังคับเปลี่ยนเมื่อเข้าสู่ระบบครั้งถัดไป)'),
    _item('<strong>Clear 2FA</strong> — Employee modal → Clear 2FA. Use when an employee is locked out due to a lost authenticator.',
          '<strong>ล้างค่า 2FA</strong> — หน้าต่างพนักงาน → ล้างค่า 2FA ใช้เมื่อพนักงานถูกล็อกออกเพราะสูญหายแอปยืนยันตัวตน'),
    _item('<strong>Account Status tab</strong> — See the activation state of all accounts: Never signed in / Not activated / Activated.',
          '<strong>แท็บสถานะบัญชี</strong> — ดูสถานะการเปิดใช้งานของบัญชีทั้งหมด: ยังไม่เคยเข้าสู่ระบบ / ยังไม่เปิดใช้งาน / เปิดใช้งานแล้ว'),
    _item('<strong>Deactivate / Reactivate</strong> — Account Status tab → select employee → Deactivate (reversible).',
          '<strong>ปิดใช้งาน / เปิดใช้งานใหม่</strong> — แท็บสถานะบัญชี → เลือกพนักงาน → ปิดใช้งาน (สามารถย้อนกลับได้)'),
  ].join(''));

  const s2 = _section('Document Templates', 'แม่แบบเอกสาร', [
    _item('<strong>Documents → TEMPLATES tab</strong> — Edit template content and activate or deactivate document types.',
          '<strong>เอกสาร → แท็บ TEMPLATES</strong> — แก้ไขเนื้อหาแม่แบบและเปิด/ปิดใช้งานประเภทเอกสาร'),
    _item('Nine template types are available: Employment Certificate, Salary Confirmation, and others.',
          'มีแม่แบบ 9 ประเภท ได้แก่ หนังสือรับรองการทำงาน หนังสือรับรองเงินเดือน และอื่นๆ'),
    _item('Fulfill employee document requests: <strong>REQUESTS tab → Fulfill</strong> — opens GENERATE pre-filled with employee data.',
          'ดำเนินการตามคำขอเอกสารของพนักงาน: <strong>แท็บคำขอ → ดำเนินการ</strong> — เปิดหน้า GENERATE พร้อมข้อมูลพนักงาน'),
  ].join(''));

  const s3 = _section('Expenses & Petty Cash', 'ค่าใช้จ่ายและเงินสดย่อย', [
    _item('<strong>Expenses → PETTY CASH tab</strong> — Record top-ups, set the budget, and view the full ledger.',
          '<strong>ค่าใช้จ่าย → แท็บเงินสดย่อย</strong> — บันทึกการเติมเงิน ตั้งงบประมาณ และดูบัญชีรายรับรายจ่ายทั้งหมด'),
    _item('<strong>Expenses → APPROVALS tab</strong> — Approve all pending claims across the team.',
          '<strong>ค่าใช้จ่าย → แท็บการอนุมัติ</strong> — อนุมัติรายการเบิกทั้งหมดของทีม'),
    _item('<strong>Expenses → REPORTS tab</strong> — View monthly expense summaries and weekly part-time wage reports.',
          '<strong>ค่าใช้จ่าย → แท็บรายงาน</strong> — ดูสรุปค่าใช้จ่ายรายเดือนและรายงานค่าจ้างพาร์ทไทม์รายสัปดาห์'),
  ].join(''));

  const s4 = _section('System Setup', 'การตั้งค่าระบบ', [
    _item('<strong>Initialize Year</strong> (Holidays page, admin action) — Run once each year to create leave-balance rows for all active employees.',
          '<strong>เริ่มต้นปีงาน</strong> (หน้าวันหยุด การดำเนินการของผู้ดูแล) — รันปีละครั้งเพื่อสร้างแถวยอดคงเหลือวันลาสำหรับพนักงานทุกคนที่ใช้งานอยู่'),
    _item('<strong>Tags</strong> — Manage activity tags used in time entries.',
          '<strong>แท็ก</strong> — จัดการแท็กกิจกรรมที่ใช้ในรายการเวลา'),
    _item('<strong>Projects</strong> — Manage billable projects and assign members.',
          '<strong>โครงการ</strong> — จัดการโครงการที่เรียกเก็บเงินได้และมอบหมายสมาชิก'),
    _item('<strong>Clients</strong> — Manage client company records and provision client login accounts.',
          '<strong>ลูกค้า</strong> — จัดการข้อมูลบริษัทลูกค้าและจัดสรรบัญชีเข้าสู่ระบบสำหรับลูกค้า'),
    _item('<strong>Manage client logins</strong> — Clients page → <em>Manage client logins</em> icon on a client row → Provision a new login, Reset password, or Delete a login. After provisioning or resetting, use the <strong>Copy credentials</strong> button to copy the login details shown (they\'re shown once).',
          '<strong>จัดการบัญชีเข้าสู่ระบบของลูกค้า</strong> — หน้าลูกค้า → ไอคอน <em>จัดการบัญชีเข้าสู่ระบบของลูกค้า</em> ที่แถวลูกค้า → จัดสรรบัญชีใหม่ รีเซ็ตรหัสผ่าน หรือลบบัญชี หลังจากจัดสรรหรือรีเซ็ตแล้ว ใช้ปุ่ม <strong>Copy credentials</strong> เพื่อคัดลอกข้อมูลเข้าสู่ระบบที่แสดง (แสดงเพียงครั้งเดียว)'),
    _item('<strong>Client Portal</strong> — When a client logs in, they see only their own company\'s projects: summary hours per project (aggregated totals, not individual time entries) and their expenses/travel claims with employee identity masked. Client logins never see any employee names.',
          '<strong>พอร์ทัลลูกค้า (Client Portal)</strong> — เมื่อลูกค้าเข้าสู่ระบบ จะเห็นเฉพาะโครงการของบริษัทตนเอง: ชั่วโมงทำงานสรุปต่อโครงการ (ยอดรวม ไม่ใช่รายการเวลาแต่ละรายการ) และค่าใช้จ่าย/ค่าเดินทางโดยปิดบังตัวตนพนักงาน บัญชีลูกค้าจะไม่เห็นชื่อพนักงานคนใดเลย'),
    _item('<strong>Part Numbers — governance</strong> — Part Numbers page → <strong>Categories</strong> manages the 3-letter category code list; <strong>Lists</strong> manages the attribute lists (material, finish, vendor, fab process, color). Before a project can mint part numbers, its client needs a 3-letter code (set on the Clients page) and the project itself needs a 3-letter code (set on the Projects page). Each project\'s customer-facing PN mode (none / template / manual) is configured on the Projects page too.',
          '<strong>เลขชิ้นส่วน — การกำกับดูแล</strong> — หน้าเลขชิ้นส่วน → <strong>Categories</strong> จัดการรายการรหัสหมวดหมู่ 3 ตัวอักษร; <strong>Lists</strong> จัดการรายการแอตทริบิวต์ (วัสดุ ผิวสำเร็จ ผู้จำหน่าย กระบวนการผลิต สี) ก่อนที่โครงการจะออกเลขชิ้นส่วนได้ ลูกค้าของโครงการต้องมีรหัส 3 ตัวอักษร (ตั้งค่าที่หน้าลูกค้า) และตัวโครงการเองต้องมีรหัส 3 ตัวอักษร (ตั้งค่าที่หน้าโครงการ) โหมดเลขชิ้นส่วนสำหรับลูกค้า (ไม่มี/เทมเพลต/กรอกเอง) ของแต่ละโครงการก็ตั้งค่าที่หน้าโครงการเช่นกัน'),
    _item('<strong>HR approval step (2-tier leave)</strong> — Leave types configured for two-tier approval show an <strong>AWAITING HR APPROVAL</strong> section in Holidays → Approvals after the manager\'s initial approval. Review and click <strong>HR Approve</strong> there to finalize the request.',
          '<strong>ขั้นตอนอนุมัติของ HR (การอนุมัติสองขั้นตอน)</strong> — วันลาที่ตั้งค่าให้อนุมัติสองขั้นตอนจะแสดงส่วน <strong>AWAITING HR APPROVAL</strong> ในหน้าวันหยุด → การอนุมัติ หลังจากผู้จัดการอนุมัติขั้นแรกแล้ว ตรวจสอบและกดปุ่ม <strong>HR Approve</strong> ที่นั่นเพื่ออนุมัติขั้นสุดท้าย'),
    _item('<strong>Reports</strong> — Full company-wide monthly expense and weekly wage reports.',
          '<strong>รายงาน</strong> — รายงานค่าใช้จ่ายรายเดือนและค่าจ้างรายสัปดาห์ระดับบริษัท'),
  ].join(''));

  const s5 = _section('Admin Logs', 'บันทึกการดำเนินการของผู้ดูแล', [
    _item('<strong>#admin-logs page</strong> — An audit trail of actions across the system: leave/expense approvals and rejections, client login provisioning, employee edits, and more.',
          '<strong>หน้า #admin-logs</strong> — บันทึกตรวจสอบการดำเนินการทั้งหมดในระบบ: การอนุมัติ/ปฏิเสธการลาและค่าใช้จ่าย การจัดสรรบัญชีลูกค้า การแก้ไขข้อมูลพนักงาน และอื่นๆ'),
    _item('<strong>Filters</strong> — Narrow the log by entity type, by actor, and by date range.',
          '<strong>ตัวกรอง</strong> — กรองบันทึกตามประเภทข้อมูล ผู้ดำเนินการ และช่วงวันที่'),
    _item('<strong>Pagination</strong> — Results are paginated; use Prev/Next to page through older entries once there are more rows than fit on one page.',
          '<strong>การแบ่งหน้า</strong> — ผลลัพธ์จะถูกแบ่งหน้า ใช้ปุ่ม Prev/Next เพื่อดูรายการเก่าเมื่อมีข้อมูลมากกว่าที่แสดงได้ในหน้าเดียว'),
  ].join(''));

  return s1 + s2 + s3 + s4 + s5;
}
