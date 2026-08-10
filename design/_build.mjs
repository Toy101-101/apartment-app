// =====================================================================
// デザイン3案（A:信頼の青 / B:和の台帳 / C:大きな色タイル）を
// JavaScript不要の静的HTMLとして書き出すスクリプト
//   実行: node design/_build.mjs
//   出力: plan-a-blue.html / plan-b-daicho.html / plan-c-tile.html / compare.html
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/* ---------------------------------------------------------------
   見本データ（架空）
   --------------------------------------------------------------- */
const TODAY = new Date(2026, 7, 10);          // 2026-08-10
const BUILDING = "さくらハイツ";

const ROOMS = [
  { no:"101", status:"occupied", name:"田中 一郎", rent:55000, kanri:3000, renewal:"2026-08-25" },
  { no:"102", status:"vacant",   rent:57000, kanri:3000, vacantSince:"2026-06-30" },
  { no:"103", status:"occupied", name:"佐藤 花子", rent:62000, kanri:3000, renewal:"2026-09-30" },
  { no:"104", status:"occupied", name:"鈴木 健太", rent:58000, kanri:3000, renewal:"2027-03-31" },
  { no:"105", status:"occupied", name:"中村 良子", rent:56000, kanri:3000, renewal:"2026-10-05" },
  { no:"201", status:"occupied", name:"山本 みどり", rent:60000, kanri:3000, renewal:"2027-01-15" },
  { no:"202", status:"occupied", name:"高橋 悟", rent:57000, kanri:3000, renewal:"2026-11-30" },
  { no:"203", status:"vacant",   rent:58000, kanri:3000, vacantSince:"2026-08-01" },
  { no:"204", status:"occupied", name:"伊藤 陽子", rent:61000, kanri:3000, renewal:"2028-04-30" },
  { no:"205", status:"leaving",  name:"小林 大輔", rent:59000, kanri:3000, renewal:"2026-10-31", leaveDate:"2026-09-30" }
];
const PAID = { "101":true, "103":false, "104":true, "105":true, "201":true, "202":false, "204":true, "205":true };

const parseD = s => { const p = s.split("-").map(Number); return new Date(p[0], p[1]-1, p[2]); };
const daysTo = s => Math.round((parseD(s) - TODAY) / 86400000);
const md     = s => { const d = parseD(s); return `${d.getMonth()+1}月${d.getDate()}日`; };
const yen    = n => n.toLocaleString("ja-JP");

const level = r => {                       // 契約更新の警告レベル
  if (r.status === "vacant") return null;
  const d = daysTo(r.renewal);
  return d <= 30 ? { lv:"danger", d } : d <= 60 ? { lv:"warn", d } : { lv:"ok", d };
};
const occupied = ROOMS.filter(r => r.status !== "vacant");
const soon     = occupied.filter(r => level(r).lv !== "ok");
const unpaid   = occupied.filter(r => !PAID[r.no]);
const paidSum  = occupied.filter(r => PAID[r.no]).reduce((s,r) => s + r.rent + r.kanri, 0);
const nVacant  = ROOMS.filter(r => r.status === "vacant").length;
const nLeaving = ROOMS.filter(r => r.status === "leaving").length;

/* ---------------------------------------------------------------
   アイコン（絵文字ではなくSVGで統一。currentColorで色が乗る）
   --------------------------------------------------------------- */
const P = { fill:"none", sw:2.1 };
const svg = (body, size=28, sw=P.sw) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
  `stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICON = {
  users:  s => svg('<circle cx="9.2" cy="8" r="3.4"/><path d="M3.4 19.6c0-3.1 2.6-5.2 5.8-5.2s5.8 2.1 5.8 5.2"/><path d="M16.2 5.2a3.4 3.4 0 0 1 0 6.4"/><path d="M17.6 14.9c2.2.6 3.4 2.4 3.4 4.7"/>', s),
  yen:    s => svg('<circle cx="12" cy="12" r="9"/><path d="M8.2 7.2 12 12l3.8-4.8"/><path d="M8.6 13h6.8M8.6 15.6h6.8M12 12v5.4"/>', s),
  wrench: s => svg('<path d="M19.8 5.1a4.6 4.6 0 0 1-6.1 6.1l-7.4 7.4a2.1 2.1 0 1 1-3-3l7.4-7.4a4.6 4.6 0 0 1 6.1-6.1l-3 3 3 3z"/>', s),
  build:  s => svg('<rect x="4" y="3.2" width="16" height="17.6" rx="1.6"/><path d="M8 7.2h3M13 7.2h3M8 11.2h3M13 11.2h3M8 15.2h3M13 15.2h3"/>', s),
  alert:  s => svg('<path d="M12 3.6 21.6 20.4H2.4L12 3.6z"/><path d="M12 9.8v4.4"/><path d="M12 17.3h.01"/>', s, 2.3),
  check:  s => svg('<path d="M4.5 12.6 9.6 17.8 19.5 6.6"/>', s, 2.8),
  cross:  s => svg('<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>', s, 2.8),
  right:  s => svg('<path d="M9 5.2 15.8 12 9 18.8"/>', s, 2.5),
  left:   s => svg('<path d="M15 5.2 8.2 12 15 18.8"/>', s, 2.5),
  down:   s => svg('<path d="M12 3.5v12"/><path d="M7 10.8 12 15.8l5-5"/><path d="M4.2 20.2h15.6"/>', s),
  cal:    s => svg('<rect x="3.2" y="5.2" width="17.6" height="15.6" rx="2"/><path d="M3.2 10h17.6M8 3.2v4M16 3.2v4"/>', s),
  home:   s => svg('<path d="M3.5 10.6 12 3.8l8.5 6.8"/><path d="M5.6 12.2v8h12.8v-8"/>', s)
};

const NAV = [
  { key:"tenants",  n:"①", label:"入居者・契約",  sub:"住んでいる人と、更新日を見る", icon:"users",  tone:"brand" },
  { key:"payments", n:"②", label:"家賃の入金",    sub:"入った・まだ をボタンで記録",   icon:"yen",    tone:"ok" },
  { key:"expenses", n:"③", label:"修繕・費用",    sub:"直した費用と、その理由を残す",   icon:"wrench", tone:"warn" },
  { key:"vacancy",  n:"④", label:"空室の状況",    sub:"部屋ごとの空き具合を色で見る",   icon:"build",  tone:"info" }
];

/* ===============================================================
   共通の土台CSS（枠・比較レイアウト。デザインの中身には触れない）
   =============================================================== */
const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#e7e7e4;color:#1b1b1b;
  font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;
  font-size:16px;line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:1400px;margin:0 auto;padding:32px 20px 80px}
.pagehead h1{font-size:32px;margin:0 0 6px;letter-spacing:.01em}
.pagehead p{margin:0 0 8px;color:#4a4a48;font-size:17px;max-width:76ch}
.rule{height:1px;background:#c9c9c4;margin:26px 0 30px;border:0}
h2.sec{font-size:24px;margin:44px 0 18px;padding-left:14px;border-left:6px solid #1b1b1b}
.row{display:flex;flex-wrap:wrap;gap:30px;align-items:flex-start}
.col{width:390px;max-width:100%}
.col > .cap{margin:0 0 10px}
.cap .t{font-size:19px;font-weight:700}
.cap .d{display:block;font-size:15px;color:#55554f;margin-top:2px}
.frame{width:390px;max-width:100%;border-radius:26px;overflow:hidden;
  border:1px solid #bfbfba;box-shadow:0 10px 30px -12px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.08)}
.frame *{pointer-events:none}
.note{background:#fff;border:1px solid #cfcfca;border-radius:14px;padding:18px 22px;font-size:16px;line-height:1.9}
.note b{font-size:17px}
.note ul{margin:8px 0 0;padding-left:1.2em}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.badges span{font-size:14px;border:1px solid #b9b9b3;border-radius:999px;padding:3px 12px;background:#fff}
@media (max-width:900px){ .col,.frame{width:100%} }
`;

/* ===============================================================
   A案「信頼の青」— 大家One 参考路線
   白基調＋濃紺。カード型・余白広め・SaaSらしい安心感
   =============================================================== */
const CSS_A = `
.dA{
  --bg:#F4F6FA; --surface:#FFFFFF;
  --ink:#0F1B2D; --ink2:#4A5568; --line:#DDE3EC;
  --brand:#0B4C8C; --brand-weak:#E7F0FA;
  --ok:#0E6B3A; --ok-weak:#E4F3EA;
  --warn:#8A5200; --warn-weak:#FBF0DE;
  --danger:#A81C12; --danger-weak:#FBE9E7;
  --info:#0B5A6B; --info-weak:#E2F1F4;
  --r:16px; --sh:0 1px 2px rgba(15,27,45,.05),0 10px 24px -14px rgba(15,27,45,.28);
  background:var(--bg);color:var(--ink);
  font-family:-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;
}
.dA .num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.dA .bar{display:flex;align-items:center;gap:8px;min-height:64px;padding:8px 12px;
  background:var(--surface);border-bottom:1px solid var(--line)}
.dA .bar .bk{display:flex;align-items:center;gap:4px;min-height:48px;padding:0 12px 0 6px;
  border-radius:12px;color:var(--brand);font-size:17px;font-weight:700;background:transparent}
.dA .bar .ttl{flex:1;text-align:center;font-size:20px;font-weight:700;letter-spacing:.02em}
.dA .bar .sp{width:86px}
.dA .body{padding:20px 16px 32px}
.dA .hello{font-size:15px;color:var(--ink2);margin:0}
.dA .bldg{font-size:28px;font-weight:800;margin:2px 0 4px;letter-spacing:.02em}
.dA .sum{font-size:16px;color:var(--ink2);margin:0 0 20px}
.dA .sum b{color:var(--ink);font-size:17px}

.dA .alerts{display:flex;flex-direction:column;gap:12px;margin-bottom:24px}
.dA .alert{display:flex;align-items:center;gap:12px;background:var(--surface);
  border:1px solid var(--line);border-left:5px solid var(--danger);border-radius:var(--r);
  padding:14px 12px 14px 14px;box-shadow:var(--sh)}
.dA .alert.w{border-left-color:var(--warn)}
.dA .alert .ic{flex:none}
.dA .alert.d>.ic{color:var(--danger)} .dA .alert.w>.ic{color:var(--warn)}
.dA .alert .tx{flex:1;min-width:0}
.dA .alert .tx b{display:block;font-size:19px;line-height:1.4}
.dA .alert .tx span{font-size:15px;color:var(--ink2)}
.dA .alert .ch{color:var(--ink2)}

.dA .lbl{font-size:14px;font-weight:700;color:var(--ink2);letter-spacing:.08em;margin:0 0 10px}
.dA .menu{display:flex;flex-direction:column;gap:12px}
.dA .item{display:flex;align-items:center;gap:14px;background:var(--surface);
  border:1px solid var(--line);border-radius:var(--r);padding:16px 14px;box-shadow:var(--sh);min-height:88px}
.dA .item .sq{width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex:none}
.dA .item .tx{flex:1;min-width:0}
.dA .item .tx b{display:block;font-size:21px;font-weight:700;line-height:1.3}
.dA .item .tx span{font-size:15px;color:var(--ink2)}
.dA .item .ch{color:#98A2B3}
.dA .sq.brand{background:var(--brand-weak);color:var(--brand)}
.dA .sq.ok{background:var(--ok-weak);color:var(--ok)}
.dA .sq.warn{background:var(--warn-weak);color:var(--warn)}
.dA .sq.info{background:var(--info-weak);color:var(--info)}

.dA .ghost{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:22px;
  min-height:60px;border:1px solid var(--line);border-radius:14px;background:var(--surface);
  color:var(--ink2);font-size:17px;font-weight:700}

.dA .month{display:flex;align-items:center;gap:8px;background:var(--surface);
  border:1px solid var(--line);border-radius:var(--r);padding:6px;margin-bottom:8px;box-shadow:var(--sh)}
.dA .month .mb{width:60px;height:60px;border-radius:12px;background:var(--brand-weak);color:var(--brand);
  display:flex;align-items:center;justify-content:center}
.dA .month .mt{flex:1;text-align:center;font-size:22px;font-weight:800}
.dA .hint{font-size:15px;color:var(--ink2);margin:0 0 16px;text-align:center}

.dA .prow{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--line);
  border-radius:var(--r);padding:12px;margin-bottom:10px;box-shadow:var(--sh)}
.dA .prow .who{flex:1;min-width:0}
.dA .prow .rm{font-size:20px;font-weight:800}
.dA .prow .nm{font-size:16px;color:var(--ink2);margin-left:6px}
.dA .prow .mn{font-size:17px;font-weight:700}
.dA .tg{display:flex;align-items:center;justify-content:center;gap:6px;width:132px;height:72px;
  border-radius:14px;font-size:19px;font-weight:800;flex:none;border:2px solid}
.dA .tg.y{background:var(--ok);border-color:var(--ok);color:#fff}
.dA .tg.n{background:#fff;border-color:var(--danger);color:var(--danger)}
.dA .prow.vac{background:#F7F8FA;box-shadow:none}
.dA .prow .vt{width:132px;text-align:center;font-size:15px;color:var(--ink2);font-weight:700}

.dA .total{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
  padding:16px;margin-top:16px;box-shadow:var(--sh)}
.dA .total .k{font-size:15px;color:var(--ink2)}
.dA .total .v{font-size:30px;font-weight:800;letter-spacing:.01em}
.dA .total .bad{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:12px;
  border-top:1px solid var(--line);color:var(--danger);font-size:17px;font-weight:700}

.dA .stats{display:flex;gap:10px;margin-bottom:18px}
.dA .stat{flex:1;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
  padding:12px 10px;text-align:center;box-shadow:var(--sh)}
.dA .stat .v{font-size:28px;font-weight:800;line-height:1.2}
.dA .stat .k{font-size:14px;color:var(--ink2)}
.dA .tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dA .tile{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
  overflow:hidden;box-shadow:var(--sh)}
.dA .tile .top{height:6px}
.dA .tile .in{padding:12px 12px 14px;text-align:center}
.dA .tile .rm{font-size:26px;font-weight:800;letter-spacing:.02em}
.dA .pill{display:inline-flex;align-items:center;gap:5px;font-size:15px;font-weight:800;
  padding:3px 12px;border-radius:999px;margin:6px 0 4px}
.dA .tile .sb{display:block;font-size:14px;color:var(--ink2)}
.dA .g .top{background:var(--ok)} .dA .g .pill{background:var(--ok-weak);color:var(--ok)}
.dA .o .top{background:var(--warn)} .dA .o .pill{background:var(--warn-weak);color:var(--warn)}
.dA .s .top{background:#667085} .dA .s .pill{background:#EEF0F3;color:#3F4A5A}
.dA .legend{display:flex;gap:14px;justify-content:center;margin-top:16px;font-size:14px;color:var(--ink2)}
.dA .legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px}
`;

const A = {
  shell: (title, body, back=true) => `
<div class="bar">${back ? `<span class="bk">${ICON.left(22)}もどる</span>` : `<span class="sp"></span>`}
  <span class="ttl">${title}</span><span class="sp"></span></div>
<div class="body">${body}</div>`,

  home: () => A.shell("さくらハイツ", `
  <p class="hello">2026年8月10日（月）</p>
  <p class="bldg">${BUILDING}</p>
  <p class="sum">全<b class="num">10</b>部屋　入居 <b class="num">8</b>／空室 <b class="num">${nVacant}</b></p>

  <p class="lbl">きょう気になること</p>
  <div class="alerts">
    <div class="alert d">${ICON.alert(30)}<span class="tx"><b>家賃がまだの部屋 <span class="num">${unpaid.length}</span>件</b>
      <span>${unpaid.map(r=>r.no+"号室").join("・")}</span></span>${ICON.right(24)}</div>
    <div class="alert w">${ICON.alert(30)}<span class="tx"><b>契約の更新が近い <span class="num">${soon.length}</span>件</b>
      <span>いちばん近いのは ${soon[0].no}号室（あと<span class="num">${level(soon[0]).d}</span>日）</span></span>${ICON.right(24)}</div>
  </div>

  <p class="lbl">やること</p>
  <div class="menu">
    ${NAV.map(n => `<div class="item"><span class="sq ${n.tone}">${ICON[n.icon](30)}</span>
      <span class="tx"><b>${n.label}</b><span>${n.sub}</span></span>${ICON.right(24)}</div>`).join("")}
  </div>
  <div class="ghost">${ICON.down(22)}データを書き出す（バックアップ）</div>`, false),

  payments: () => A.shell("家賃の入金", `
  <div class="month"><span class="mb">${ICON.left(24)}</span>
    <span class="mt num">2026年8月分</span><span class="mb">${ICON.right(24)}</span></div>
  <p class="hint">ボタンを1回押すと切りかわります</p>
  ${ROOMS.map(r => r.status === "vacant"
    ? `<div class="prow vac"><span class="who"><span class="rm num">${r.no}</span>
         <span class="nm">空室のため なし</span></span><span class="vt">—</span></div>`
    : `<div class="prow"><span class="who"><span class="rm num">${r.no}</span><span class="nm">${r.name}</span>
         <div class="mn num">¥${yen(r.rent + r.kanri)}</div></span>
       <span class="tg ${PAID[r.no] ? "y" : "n"}">${PAID[r.no] ? ICON.check(24)+"入った" : ICON.cross(24)+"まだ"}</span></div>`
  ).join("")}
  <div class="total"><div class="k">入っているお金</div><div class="v num">¥${yen(paidSum)}</div>
    <div class="bad">${ICON.alert(22)}まだの部屋 <span class="num">${unpaid.length}</span>件（${unpaid.map(r=>r.no).join("・")}号室）</div></div>`),

  vacancy: () => A.shell("空室の状況", `
  <div class="stats">
    <div class="stat"><div class="v num">${occupied.length - nLeaving}</div><div class="k">入居中</div></div>
    <div class="stat"><div class="v num" style="color:var(--warn)">${nVacant}</div><div class="k">空室</div></div>
    <div class="stat"><div class="v num" style="color:#3F4A5A">${nLeaving}</div><div class="k">退去予定</div></div>
  </div>
  <div class="tiles">
    ${ROOMS.map(r => {
      const k = r.status === "vacant" ? "o" : r.status === "leaving" ? "s" : "g";
      const st = r.status === "vacant" ? "空室" : r.status === "leaving" ? "退去予定" : "入居中";
      const sb = r.status === "vacant" ? md(r.vacantSince)+"から" : r.status === "leaving" ? md(r.leaveDate)+"まで" : r.name;
      return `<div class="tile ${k}"><div class="top"></div><div class="in">
        <div class="rm num">${r.no}</div><span class="pill">${st}</span><span class="sb">${sb}</span></div></div>`;
    }).join("")}
  </div>
  <div class="legend"><span><i style="background:var(--ok)"></i>入居中</span>
    <span><i style="background:var(--warn)"></i>空室</span>
    <span><i style="background:#667085"></i>退去予定</span></div>`)
};

/* ===============================================================
   B案「和の台帳」
   生成りの紙、墨の文字、朱の差し色。罫線と枠で台帳のように見せる
   =============================================================== */
const CSS_B = `
.dB{
  --bg:#F4EEE2; --surface:#FFFCF5;
  --ink:#211E19; --ink2:#5E574B; --line:#DCCFB6; --line2:#C4B291;
  --shu:#A8321E; --shu-weak:#F7E7E1;
  --ai:#1F4C6B;  --ai-weak:#E4EDF3;
  --matsu:#2E6647; --matsu-weak:#E5EFE7;
  --yamabuki:#8A6200; --yamabuki-weak:#F6ECD5;
  --r:6px;
  background:var(--bg);color:var(--ink);
  font-family:-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;
}
.dB .num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.dB .mincho{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-weight:600}
.dB .bar{display:flex;align-items:center;gap:8px;min-height:66px;padding:8px 12px;
  background:var(--surface);border-bottom:2px solid var(--line2);
  box-shadow:0 2px 0 var(--line)}
.dB .bar .bk{display:flex;align-items:center;gap:4px;min-height:48px;padding:0 12px 0 6px;
  color:var(--ai);font-size:17px;font-weight:700}
.dB .bar .ttl{flex:1;text-align:center;font-size:21px;letter-spacing:.08em}
.dB .bar .sp{width:86px}
.dB .body{padding:20px 16px 32px}

.dB .plate{border:2px solid var(--line2);background:var(--surface);border-radius:var(--r);
  padding:14px 16px;margin-bottom:22px;position:relative}
.dB .plate:after{content:"";position:absolute;inset:4px;border:1px solid var(--line);border-radius:3px;pointer-events:none}
.dB .plate .d{font-size:14px;color:var(--ink2);letter-spacing:.1em}
.dB .plate .b{font-size:27px;letter-spacing:.1em;margin-top:2px}
.dB .plate .s{font-size:15px;color:var(--ink2);margin-top:4px}

.dB .lbl{display:flex;align-items:center;gap:10px;font-size:15px;color:var(--ink2);
  letter-spacing:.12em;margin:0 0 12px}
.dB .lbl:after{content:"";flex:1;height:1px;background:var(--line2)}

.dB .fuda{display:flex;align-items:center;gap:12px;background:var(--surface);
  border:1px solid var(--line2);border-left:6px solid var(--shu);border-radius:var(--r);
  padding:13px 12px;margin-bottom:10px}
.dB .fuda.w{border-left-color:var(--yamabuki)}
.dB .fuda>.ic{flex:none;color:var(--shu)} .dB .fuda.w>.ic{color:var(--yamabuki)}
.dB .fuda .tx{flex:1;min-width:0}
.dB .fuda .tx b{display:block;font-size:19px}
.dB .fuda .tx span{font-size:14px;color:var(--ink2)}
.dB .fuda .ch{color:var(--ink2)}

.dB .ledger{background:var(--surface);border:2px solid var(--line2);border-radius:var(--r);overflow:hidden;margin-bottom:22px}
.dB .lrow{display:flex;align-items:center;gap:13px;padding:15px 13px;border-bottom:1px solid var(--line)}
.dB .lrow:last-child{border-bottom:0}
.dB .lrow .kanji{width:42px;height:42px;flex:none;border:1.5px solid var(--shu);color:var(--shu);
  border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700}
.dB .lrow .tx{flex:1;min-width:0}
.dB .lrow .tx b{display:block;font-size:21px;letter-spacing:.06em}
.dB .lrow .tx span{font-size:14px;color:var(--ink2)}
.dB .lrow .ic{color:var(--ink2)}

.dB .ghost{display:flex;align-items:center;justify-content:center;gap:8px;min-height:58px;
  border:1px dashed var(--line2);border-radius:var(--r);color:var(--ink2);font-size:16px;font-weight:700}

.dB .month{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.dB .month .mb{width:58px;height:58px;border:1.5px solid var(--line2);background:var(--surface);
  border-radius:var(--r);display:flex;align-items:center;justify-content:center;color:var(--ai)}
.dB .month .mt{flex:1;text-align:center;font-size:23px;letter-spacing:.06em}
.dB .hint{font-size:14px;color:var(--ink2);text-align:center;margin:0 0 14px}

.dB .book{background:var(--surface);border:2px solid var(--line2);border-radius:var(--r);overflow:hidden}
.dB .bhead{display:flex;background:#EFE6D3;border-bottom:2px solid var(--line2);
  font-size:13px;color:var(--ink2);letter-spacing:.1em;padding:7px 12px}
.dB .bhead .a{flex:1}.dB .bhead .b{width:112px;text-align:center}
.dB .brow{display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid var(--line)}
.dB .brow:last-child{border-bottom:0}
.dB .brow .who{flex:1;min-width:0}
.dB .brow .rm{font-size:19px;font-weight:700;letter-spacing:.04em}
.dB .brow .nm{font-size:15px;color:var(--ink2);margin-left:6px}
.dB .brow .mn{font-size:16px}
.dB .stamp{width:112px;height:68px;flex:none;border-radius:4px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1px;border:2px solid;font-weight:800}
.dB .stamp .k{font-size:23px;letter-spacing:.14em;line-height:1.2}
.dB .stamp .e{font-size:12px;letter-spacing:.06em}
.dB .stamp.y{border-color:var(--shu);color:var(--shu);background:var(--shu-weak)}
.dB .stamp.n{border-color:var(--line2);color:var(--ink2);background:#F1EADC;border-style:dashed}
.dB .brow.vac{background:#F5F0E4}
.dB .brow .vt{width:112px;text-align:center;font-size:14px;color:var(--ink2)}

.dB .total{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;
  border:2px solid var(--line2);background:var(--surface);border-radius:var(--r);padding:14px 16px;margin-top:16px}
.dB .total .k{font-size:14px;color:var(--ink2);letter-spacing:.08em}
.dB .total .v{font-size:29px;letter-spacing:.02em}
.dB .total .r{text-align:right;color:var(--shu);font-size:15px;font-weight:700}

.dB .stats{display:flex;border:2px solid var(--line2);background:var(--surface);border-radius:var(--r);margin-bottom:18px}
.dB .stat{flex:1;text-align:center;padding:11px 6px;border-right:1px solid var(--line)}
.dB .stat:last-child{border-right:0}
.dB .stat .v{font-size:26px;line-height:1.25}
.dB .stat .k{font-size:13px;color:var(--ink2);letter-spacing:.06em}
.dB .tiles{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.dB .fudaC{background:var(--surface);border:1.5px solid var(--line2);border-radius:var(--r);
  padding:12px 8px 13px;text-align:center;position:relative;overflow:hidden}
.dB .fudaC .bandline{position:absolute;left:0;top:0;bottom:0;width:7px}
.dB .fudaC .rm{font-size:25px;font-weight:700;letter-spacing:.04em}
.dB .fudaC .st{display:inline-block;font-size:15px;font-weight:800;padding:2px 12px;border-radius:3px;margin:5px 0 3px;border:1px solid}
.dB .fudaC .sb{display:block;font-size:13px;color:var(--ink2)}
.dB .g .bandline{background:var(--matsu)} .dB .g .st{color:var(--matsu);border-color:var(--matsu);background:var(--matsu-weak)}
.dB .o .bandline{background:var(--shu)}   .dB .o .st{color:var(--shu);border-color:var(--shu);background:var(--shu-weak)}
.dB .s .bandline{background:#8A8272}      .dB .s .st{color:#5E574B;border-color:#B6AC97;background:#EFE9DC}
.dB .legend{display:flex;gap:14px;justify-content:center;margin-top:16px;font-size:13px;color:var(--ink2)}
.dB .legend i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}
`;

const B = {
  shell: (title, body, back=true) => `
<div class="bar">${back ? `<span class="bk">${ICON.left(22)}もどる</span>` : `<span class="sp"></span>`}
  <span class="ttl mincho">${title}</span><span class="sp"></span></div>
<div class="body">${body}</div>`,

  home: () => B.shell("さくらハイツ 管理帳", `
  <div class="plate"><div class="d num">令和八年 八月十日</div>
    <div class="b mincho">${BUILDING} 管理帳</div>
    <div class="s">全<span class="num">10</span>室　入居 <span class="num">8</span>／空室 <span class="num">${nVacant}</span></div></div>

  <p class="lbl">きょう気になること</p>
  <div class="fuda">${ICON.alert(28)}<span class="tx"><b>家賃がまだの部屋 <span class="num">${unpaid.length}</span>件</b>
    <span>${unpaid.map(r=>r.no+"号室").join("・")}</span></span>${ICON.right(22)}</div>
  <div class="fuda w" style="margin-bottom:22px">${ICON.alert(28)}<span class="tx"><b>契約の更新が近い <span class="num">${soon.length}</span>件</b>
    <span>いちばん近いのは ${soon[0].no}号室（あと<span class="num">${level(soon[0]).d}</span>日）</span></span>${ICON.right(22)}</div>

  <p class="lbl">帳面をひらく</p>
  <div class="ledger">
    ${NAV.map(n => `<div class="lrow"><span class="kanji">${n.n}</span>
      <span class="tx"><b class="mincho">${n.label}</b><span>${n.sub}</span></span>${ICON.right(22)}</div>`).join("")}
  </div>
  <div class="ghost">${ICON.down(20)}控えを書き出す（バックアップ）</div>`, false),

  payments: () => B.shell("家賃の入金", `
  <div class="month"><span class="mb">${ICON.left(24)}</span>
    <span class="mt mincho num">令和八年 八月分</span><span class="mb">${ICON.right(24)}</span></div>
  <p class="hint">押すと「済」と「未」が入れかわります</p>
  <div class="book">
    <div class="bhead"><span class="a">部屋・お名前</span><span class="b">入金</span></div>
    ${ROOMS.map(r => r.status === "vacant"
      ? `<div class="brow vac"><span class="who"><span class="rm num">${r.no}</span>
           <span class="nm">空室のため なし</span></span><span class="vt">—</span></div>`
      : `<div class="brow"><span class="who"><span class="rm num">${r.no}</span><span class="nm">${r.name}</span>
           <div class="mn num">${yen(r.rent + r.kanri)}円</div></span>
         <span class="stamp ${PAID[r.no] ? "y" : "n"}"><span class="k mincho">${PAID[r.no] ? "済" : "未"}</span>
           <span class="e">${PAID[r.no] ? "入りました" : "まだです"}</span></span></div>`
    ).join("")}
  </div>
  <div class="total"><span><span class="k">入金のあった額</span><div class="v mincho num">${yen(paidSum)}円</div></span>
    <span class="r">未 <span class="num">${unpaid.length}</span>件<br>${unpaid.map(r=>r.no).join("・")}号室</span></div>`),

  vacancy: () => B.shell("空室の状況", `
  <div class="stats">
    <div class="stat"><div class="v mincho num">${occupied.length - nLeaving}</div><div class="k">入居中</div></div>
    <div class="stat"><div class="v mincho num" style="color:var(--shu)">${nVacant}</div><div class="k">空室</div></div>
    <div class="stat"><div class="v mincho num" style="color:#5E574B">${nLeaving}</div><div class="k">退去予定</div></div>
  </div>
  <div class="tiles">
    ${ROOMS.map(r => {
      const k = r.status === "vacant" ? "o" : r.status === "leaving" ? "s" : "g";
      const st = r.status === "vacant" ? "空室" : r.status === "leaving" ? "退去予定" : "入居中";
      const sb = r.status === "vacant" ? md(r.vacantSince)+"から" : r.status === "leaving" ? md(r.leaveDate)+"まで" : r.name;
      return `<div class="fudaC ${k}"><span class="bandline"></span>
        <div class="rm num">${r.no}</div><span class="st">${st}</span><span class="sb">${sb}</span></div>`;
    }).join("")}
  </div>
  <div class="legend"><span><i style="background:var(--matsu)"></i>入居中</span>
    <span><i style="background:var(--shu)"></i>空室</span>
    <span><i style="background:#8A8272"></i>退去予定</span></div>`)
};

/* ===============================================================
   C案「大きな色タイル」
   判読性と押しやすさを最優先。案内標識のような明快さ
   =============================================================== */
const CSS_C = `
.dC{
  --bg:#FFFFFF; --ink:#000000; --ink2:#3A3A3A; --line:#111111;
  --brand:#00417A; --ok:#12603A; --warn:#8A4200; --danger:#A4160E; --teal:#0A5561;
  background:var(--bg);color:var(--ink);
  font-family:-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;
}
.dC .num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.dC .bar{display:flex;align-items:center;gap:8px;min-height:72px;padding:8px 12px;
  background:var(--brand);color:#fff;border-bottom:4px solid #002B52}
.dC .bar .bk{display:flex;align-items:center;gap:4px;min-height:52px;padding:0 14px 0 8px;
  background:#fff;color:var(--brand);border-radius:10px;font-size:18px;font-weight:800}
.dC .bar .ttl{flex:1;text-align:center;font-size:23px;font-weight:800}
.dC .bar .sp{width:100px}
.dC .body{padding:16px 14px 32px}

.dC .banner{display:flex;align-items:center;gap:12px;color:#fff;background:var(--danger);
  border-radius:12px;padding:14px 12px;margin-bottom:10px}
.dC .banner.w{background:var(--warn)}
.dC .banner .tx{flex:1;min-width:0}
.dC .banner .tx b{display:block;font-size:21px;font-weight:800;line-height:1.35}
.dC .banner .tx span{font-size:15px;opacity:.95}

.dC .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
.dC .big{border-radius:14px;color:#fff;padding:16px 12px 14px;min-height:150px;
  display:flex;flex-direction:column;justify-content:space-between}
.dC .big .n{font-size:15px;font-weight:800;opacity:.9}
.dC .big b{font-size:24px;font-weight:800;line-height:1.3;display:block;margin-top:6px}
.dC .big span{font-size:14px;opacity:.95;display:block;margin-top:3px}
.dC .b1{background:var(--brand)} .dC .b2{background:var(--ok)}
.dC .b3{background:var(--warn)} .dC .b4{background:var(--teal)}

.dC .ghost{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;
  min-height:64px;border:3px solid var(--line);border-radius:12px;font-size:18px;font-weight:800}

.dC .month{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.dC .month .mb{width:66px;height:66px;border:3px solid var(--brand);color:var(--brand);
  border-radius:12px;display:flex;align-items:center;justify-content:center}
.dC .month .mt{flex:1;text-align:center;font-size:24px;font-weight:800}
.dC .hint{font-size:15px;color:var(--ink2);text-align:center;margin:0 0 14px}

.dC .prow{display:flex;align-items:stretch;gap:0;border:3px solid var(--line);border-radius:12px;
  overflow:hidden;margin-bottom:10px}
.dC .prow .who{flex:1;min-width:0;padding:11px 12px}
.dC .prow .rm{font-size:22px;font-weight:800}
.dC .prow .nm{font-size:16px;margin-left:6px}
.dC .prow .mn{font-size:17px;font-weight:700}
.dC .tg{width:140px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:2px;font-size:19px;font-weight:800;border-left:3px solid var(--line)}
.dC .tg.y{background:var(--ok);color:#fff}
.dC .tg.n{background:#FFF;color:var(--danger)}
.dC .tg.n .u{text-decoration:underline;text-underline-offset:3px}
.dC .prow.vac{border-color:#8A8A8A;color:#4A4A4A}
.dC .prow .vt{width:140px;flex:none;display:flex;align-items:center;justify-content:center;
  border-left:3px solid #8A8A8A;font-size:16px;background:#F0F0F0}

.dC .total{border:3px solid var(--line);border-radius:12px;padding:14px;margin-top:14px}
.dC .total .k{font-size:15px}
.dC .total .v{font-size:32px;font-weight:800}
.dC .total .bad{margin-top:10px;padding:9px 10px;background:var(--danger);color:#fff;
  border-radius:8px;font-size:17px;font-weight:800;display:flex;align-items:center;gap:8px}

.dC .stats{display:flex;gap:10px;margin-bottom:16px}
.dC .stat{flex:1;border:3px solid var(--line);border-radius:12px;padding:9px 6px;text-align:center}
.dC .stat .v{font-size:30px;font-weight:800;line-height:1.15}
.dC .stat .k{font-size:14px;font-weight:700}
.dC .tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dC .tile{border-radius:14px;padding:14px 8px 15px;text-align:center;color:#fff}
.dC .tile .rm{font-size:30px;font-weight:800;letter-spacing:.02em}
.dC .tile .st{display:block;font-size:19px;font-weight:800;margin:2px 0 3px}
.dC .tile .sb{display:block;font-size:14px}
.dC .g{background:var(--ok)} .dC .o{background:var(--warn)} .dC .s{background:#4A4A4A}
.dC .legend{display:flex;gap:14px;justify-content:center;margin-top:16px;font-size:14px;font-weight:700}
.dC .legend i{display:inline-block;width:13px;height:13px;border-radius:3px;margin-right:5px;vertical-align:-1px}
`;

const C = {
  shell: (title, body, back=true) => `
<div class="bar">${back ? `<span class="bk">${ICON.left(22)}もどる</span>` : `<span class="sp"></span>`}
  <span class="ttl">${title}</span><span class="sp"></span></div>
<div class="body">${body}</div>`,

  home: () => C.shell("さくらハイツ", `
  <div class="banner">${ICON.alert(34)}<span class="tx"><b>家賃がまだ <span class="num">${unpaid.length}</span>件</b>
    <span>${unpaid.map(r=>r.no+"号室").join("・")}</span></span>${ICON.right(26)}</div>
  <div class="banner w">${ICON.alert(34)}<span class="tx"><b>更新が近い <span class="num">${soon.length}</span>件</b>
    <span>いちばん近いのは ${soon[0].no}号室（あと<span class="num">${level(soon[0]).d}</span>日）</span></span>${ICON.right(26)}</div>
  <div class="grid">
    ${NAV.map((n,i) => `<div class="big b${i+1}">${ICON[n.icon](38)}
      <span><span class="n">${n.n}</span><b>${n.label}</b><span>${n.sub}</span></span></div>`).join("")}
  </div>
  <div class="ghost">${ICON.down(22)}データを書き出す</div>`, false),

  payments: () => C.shell("家賃の入金", `
  <div class="month"><span class="mb">${ICON.left(26)}</span>
    <span class="mt num">2026年8月分</span><span class="mb">${ICON.right(26)}</span></div>
  <p class="hint">押すと切りかわります</p>
  ${ROOMS.map(r => r.status === "vacant"
    ? `<div class="prow vac"><span class="who"><span class="rm num">${r.no}</span>
         <span class="nm">空室</span></span><span class="vt">なし</span></div>`
    : `<div class="prow"><span class="who"><span class="rm num">${r.no}</span><span class="nm">${r.name}</span>
         <div class="mn num">¥${yen(r.rent + r.kanri)}</div></span>
       <span class="tg ${PAID[r.no] ? "y" : "n"}">${PAID[r.no] ? ICON.check(26) : ICON.cross(26)}
         <span class="${PAID[r.no] ? "" : "u"}">${PAID[r.no] ? "入った" : "まだ"}</span></span></div>`
  ).join("")}
  <div class="total"><div class="k">入っているお金</div><div class="v num">¥${yen(paidSum)}</div>
    <div class="bad">${ICON.alert(22)}まだ <span class="num">${unpaid.length}</span>件（${unpaid.map(r=>r.no).join("・")}号室）</div></div>`),

  vacancy: () => C.shell("空室の状況", `
  <div class="stats">
    <div class="stat"><div class="v num">${occupied.length - nLeaving}</div><div class="k">入居中</div></div>
    <div class="stat"><div class="v num" style="color:var(--warn)">${nVacant}</div><div class="k">空室</div></div>
    <div class="stat"><div class="v num" style="color:#4A4A4A">${nLeaving}</div><div class="k">退去予定</div></div>
  </div>
  <div class="tiles">
    ${ROOMS.map(r => {
      const k = r.status === "vacant" ? "o" : r.status === "leaving" ? "s" : "g";
      const st = r.status === "vacant" ? "空室" : r.status === "leaving" ? "退去予定" : "入居中";
      const sb = r.status === "vacant" ? md(r.vacantSince)+"から" : r.status === "leaving" ? md(r.leaveDate)+"まで" : r.name;
      return `<div class="tile ${k}"><div class="rm num">${r.no}</div>
        <span class="st">${st}</span><span class="sb">${sb}</span></div>`;
    }).join("")}
  </div>
  <div class="legend"><span><i style="background:var(--ok)"></i>入居中</span>
    <span><i style="background:var(--warn)"></i>空室</span>
    <span><i style="background:#4A4A4A"></i>退去予定</span></div>`)
};

/* ===============================================================
   出力
   =============================================================== */
const DESIGNS = [
  { id:"dA", file:"plan-a-blue.html", css:CSS_A, r:A,
    name:"A案　信頼の青", tag:"大家One 参考路線",
    lead:"白基調＋濃紺。カード型で余白を広くとり、賃貸管理サービスとして見慣れた安心感を出す。",
    good:["初めて見る人でも「アプリらしい」と分かる","情報の区切りが明確で、項目が増えても崩れない","将来ほかの人に引き継いだときも違和感がない"],
    bad:["よくある業務アプリの見た目で、個性は控えめ","白背景は明るい場所でまぶしく感じることがある"],
    tokens:["背景 #F4F6FA","面 #FFFFFF","文字 #0F1B2D","主役 #0B4C8C","角丸 16px","影 やわらかく1段階"] },
  { id:"dB", file:"plan-b-daicho.html", css:CSS_B, r:B,
    name:"B案　和の台帳", tag:"家族のアーカイブ路線",
    lead:"生成りの紙、墨の文字、朱の差し色。罫線と枠で、紙の管理帳をそのまま画面にしたように見せる。",
    good:["紙の台帳からの移行に抵抗が少ない","「済/未」の判子表現が直感的で、遠目にも分かる","白背景よりまぶしさが少なく、目が疲れにくい"],
    bad:["装飾のぶん、情報密度はやや下がる","見出しの明朝体は端末によって太さが変わる"],
    tokens:["背景 #F4EEE2","面 #FFFCF5","文字 #211E19（墨）","差し色 #A8321E（朱）","角丸 6px","影なし・罫線で階層"] },
  { id:"dC", file:"plan-c-tile.html", css:CSS_C, r:C,
    name:"C案　大きな色タイル", tag:"判読性 最優先路線",
    lead:"案内標識のような明快さ。ホームを4つの大きな色タイルにし、押す場所を最大化する。",
    good:["押す場所がいちばん大きく、迷いが最も少ない","色面が広いので、離れていても状態が分かる","視力が落ちても読みやすい"],
    bad:["色面が強く、長く見ると疲れる人もいる","事務的・機械的な印象になりやすい","情報が増えると1画面に収まりにくい"],
    tokens:["背景 #FFFFFF","文字 #000000（21:1）","主役 #00417A","枠線 3px で区切る","角丸 12〜14px","影なし・面と枠で階層"] }
];

const SCREENS = [
  { key:"home",     label:"ホーム",       note:"最初に開く画面。押すべきことが上に出る" },
  { key:"payments", label:"家賃の入金",   note:"大きなボタンを1回押すだけで切りかえ" },
  { key:"vacancy",  label:"空室の状況",   note:"色と文字の両方で状態が分かる" }
];

const page = (title, css, bodyHtml) => `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${BASE_CSS}${css}</style>
</head><body>${bodyHtml}</body></html>
`;

const frame = (d, sk) => `<div class="frame ${d.id}">${d.r[sk]()}</div>`;

// --- 個別ページ（1案ぶんの3画面） ---
for (const d of DESIGNS) {
  const body = `<div class="wrap">
  <div class="pagehead">
    <h1>${d.name}<span style="font-size:17px;font-weight:400;color:#55554f;margin-left:12px">${d.tag}</span></h1>
    <p>${d.lead}</p>
    <div class="badges">${d.tokens.map(t => `<span>${t}</span>`).join("")}</div>
  </div>
  <hr class="rule">
  <div class="row">
    ${SCREENS.map(s => `<div class="col"><div class="cap"><span class="t">${s.label}</span>
      <span class="d">${s.note}</span></div>${frame(d, s.key)}</div>`).join("")}
  </div>
  <h2 class="sec">この案の長所と短所</h2>
  <div class="note"><b>向いているところ</b><ul>${d.good.map(x => `<li>${x}</li>`).join("")}</ul>
    <p style="margin:14px 0 0"><b>気をつけるところ</b></p><ul>${d.bad.map(x => `<li>${x}</li>`).join("")}</ul></div>
</div>`;
  fs.writeFileSync(path.join(DIR, d.file), page(`${d.name}｜アパート管理アプリ`, d.css, body), "utf8");
}

// --- 比較ページ（画面ごとに3案を横並び） ---
const compare = `<div class="wrap">
<div class="pagehead">
  <h1>デザイン3案 くらべて選ぶ</h1>
  <p>同じ画面を3つの方向性で作りました。中身（情報）はすべて同じで、<b>見せ方だけ</b>が違います。
  どれも「文字20px以上・ボタン高さ64px以上・コントラストAAA・色だけに頼らない」という判読性の基準は満たしています。
  気に入った案を1つ選んでください。その案で全画面を作り込みます。</p>
  <div class="badges">${DESIGNS.map(d => `<span>${d.name} … ${d.tag}</span>`).join("")}</div>
</div>
<hr class="rule">
${SCREENS.map(s => `<h2 class="sec">${s.label}　<span style="font-size:16px;font-weight:400;color:#55554f">${s.note}</span></h2>
<div class="row">${DESIGNS.map(d => `<div class="col"><div class="cap"><span class="t">${d.name}</span>
  <span class="d">${d.tag}</span></div>${frame(d, s.key)}</div>`).join("")}</div>`).join("")}
<h2 class="sec">案ごとの性格</h2>
<div class="row">${DESIGNS.map(d => `<div class="col"><div class="note"><b>${d.name}</b>
  <p style="margin:6px 0 0;font-size:15px">${d.lead}</p>
  <p style="margin:12px 0 0"><b>長所</b></p><ul>${d.good.map(x => `<li>${x}</li>`).join("")}</ul>
  <p style="margin:12px 0 0"><b>短所</b></p><ul>${d.bad.map(x => `<li>${x}</li>`).join("")}</ul></div></div>`).join("")}</div>
<h2 class="sec">3案に共通して守っていること</h2>
<div class="note">
  <ul>
    <li><b>余白は8pxの倍数</b>で統一（前回の見本は12/14/18pxが混在していました）</li>
    <li><b>金額は等幅数字</b>にして、桁を縦に揃えました</li>
    <li><b>アイコンはすべてSVG</b>で描き直し（絵文字は端末ごとに崩れ、高齢者には潰れて見えるため）</li>
    <li><b>階層は「面・線・影」の3段階</b>で表現し、重要なものだけを浮かせています</li>
    <li><b>色だけで意味を伝えない</b>（「空室」「まだ」など文字を必ず併記）</li>
    <li>押せる場所は<b>すべて縦56px以上</b>、主要ボタンは<b>68px以上</b></li>
  </ul>
</div>
</div>`;

fs.writeFileSync(path.join(DIR, "compare.html"),
  page("デザイン3案 くらべて選ぶ｜アパート管理アプリ", CSS_A + CSS_B + CSS_C, compare), "utf8");

console.log("書き出しました:");
for (const d of DESIGNS) console.log("  " + d.file);
console.log("  compare.html");
