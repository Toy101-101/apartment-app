// =====================================================================
// v1（家賃の入金だけ）の画面デザイン — A案ベース＋C案の寸法＋B案の語彙
//   実行: node design/_build-v1.mjs   出力: v1-payments.html
//   ※JavaScript不要の静的HTML（プレビューでもそのまま見られる）
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const DIR = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- 見本データ（Day1の聞き取りで本物に差し替える） ------------- */
const BLDG = "あさひ荘";
const MONTH = { reiwa: 8, m: 8, label: "令和8年8月分" };

//  way: "te"=手渡し / "furi"=振込     state: "done"=済 / "yet"=未 / "wait"=通帳まち
const ROWS = [
  { no:"101", name:"田中 一郎",  amount:61000, way:"te",   state:"done", on:"8月3日", note:"いつも月初に持ってきてくれる" },
  { no:"102", name:"佐藤 花子",  amount:65000, way:"furi", state:"wait" },
  { no:"103", name:"鈴木 健太",  amount:61000, way:"furi", state:"done", on:"8月5日" },
  { no:"104", name:"中村 良子",  amount:59000, way:"te",   state:"yet",  note:"耳が遠い。訪ねるか手紙で" },
  { no:"201", name:"山本 みどり", amount:63000, way:"furi", state:"done", on:"8月1日" },
  { no:"202", name:"高橋 悟",    amount:60000, way:"te",   state:"yet",  note:"毎月25日ごろ手渡し。月末まで待つ" },
  { no:"203", name:null,         amount:0,     way:null,   state:"empty" },
  { no:"204", name:"伊藤 陽子",  amount:64000, way:"furi", state:"wait" }
];

const yen = n => "¥" + n.toLocaleString("ja-JP");
const sum = s => ROWS.filter(r => r.state === s).reduce((a,r) => a + r.amount, 0);
const cnt = s => ROWS.filter(r => r.state === s).length;

/* ---------------- アイコン（線は2.6。細いと白内障の目でにじんで消える） ------- */
const svg = (b, s=28, w=2.6) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"
 stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
const I = {
  check: s => svg('<path d="M4.5 12.6 9.6 17.8 19.5 6.6"/>', s, 3),
  cross: s => svg('<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>', s, 3),
  book:  s => svg('<path d="M4 4.5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H4z"/><path d="M20 4.5h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H20z"/>', s),
  hand:  s => svg('<path d="M8 11V4.8a1.6 1.6 0 0 1 3.2 0V11"/><path d="M11.2 10.4V3.6a1.6 1.6 0 0 1 3.2 0v7.4"/><path d="M14.4 11V5.6a1.6 1.6 0 0 1 3.2 0v8.6c0 3.9-2.6 6.4-6 6.4-2.4 0-4-1-5.2-2.9L4 13.6a1.6 1.6 0 0 1 2.6-1.9L8 13.4"/>', s),
  left:  s => svg('<path d="M15 5.2 8.2 12 15 18.8"/>', s, 3),
  right: s => svg('<path d="M9 5.2 15.8 12 9 18.8"/>', s, 3),
  send:  s => svg('<path d="M21 3.5 10.5 14"/><path d="M21 3.5 14.4 21l-3.9-7-7-3.9z"/>', s),
  print: s => svg('<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="1.6"/><path d="M7 14h10v6.5H7z"/>', s),
  undo:  s => svg('<path d="M4 9h9.5a5.5 5.5 0 1 1 0 11H7"/><path d="M8 4.5 3.5 9 8 13.5"/>', s),
  alert: s => svg('<path d="M12 3.6 21.6 20.4H2.4z"/><path d="M12 9.8v4.4M12 17.3h.01"/>', s, 2.8),
  home:  s => svg('<path d="M3.5 10.6 12 3.8l8.5 6.8"/><path d="M5.6 12.2v8h12.8v-8"/>', s)
};

/* ---------------- CSS ------------------------------------------------ */
const CSS = `
/* 1rem = 20px。端末の文字サイズ設定に追随する（px固定にしない） */
html{font-size:125%}
*{box-sizing:border-box}
body{margin:0;background:#E8E7E3;color:#191A16;
  font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;
  font-size:.8rem;line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:1400px;margin:0 auto;padding:1.6rem 1rem 4rem}
.wrap h1{font-size:1.6rem;margin:0 0 .3rem}
.wrap .lead{margin:0;color:#4B4B45;max-width:74ch}
.wrap hr{border:0;height:1px;background:#C6C6C0;margin:1.4rem 0}
.grid{display:flex;flex-wrap:wrap;gap:1.8rem;align-items:flex-start}
.item{width:400px;max-width:100%}
.item .cap b{font-size:.95rem}
.item .cap span{display:block;font-size:.76rem;color:#55554E;margin:.1rem 0 .5rem}
.frame{border-radius:26px;overflow:hidden;border:1px solid #B9B9B3;
  box-shadow:0 12px 30px -14px rgba(0,0,0,.4),0 2px 6px rgba(0,0,0,.07)}
.memo{background:#fff;border:1px solid #CFCFC9;border-radius:14px;padding:1rem 1.2rem;line-height:1.9}
.memo ul{margin:.4rem 0 0;padding-left:1.2em}

/* ============ アプリ本体 ============ */
.app{
  --paper:#F7F5F0;      /* 生成り寄りの背景。真っ白はまぶしい */
  --card:#FFFFFF;
  --ink:#171814; --ink2:#4A4B44; --line:#DAD8D0;
  --navy:#0B4C8C; --navy-weak:#E8F0F9;
  --done:#166B3C; --done-weak:#E5F2E9;   /* 済＝静かに */
  --yet:#A4160E;                          /* 未＝強く */
  --wait:#5B5648; --wait-weak:#EFEDE5;    /* 通帳まち＝中立 */
  background:var(--paper);color:var(--ink)}
.app .num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}

/* 上部バー */
.app .bar{display:flex;align-items:center;gap:.4rem;min-height:3.4rem;padding:.4rem .6rem;
  background:var(--card);border-bottom:1px solid var(--line)}
.app .bar .bk{display:flex;align-items:center;gap:.15rem;min-height:3.2rem;min-width:3.2rem;
  padding:0 .6rem 0 .3rem;border-radius:12px;color:var(--navy);font-size:.85rem;font-weight:700}
.app .bar .ttl{flex:1;text-align:center;font-size:1rem;font-weight:700}
.app .bar .sp{width:5.2rem}
.app .body{padding:.8rem .7rem 1rem}

/* 月送り */
.app .month{display:flex;align-items:center;gap:.4rem;background:var(--card);
  border:1px solid var(--line);border-radius:14px;padding:.3rem;margin-bottom:.6rem}
.app .month .mb{width:3.4rem;height:3.4rem;border-radius:11px;background:var(--navy-weak);
  color:var(--navy);display:flex;align-items:center;justify-content:center}
.app .month .mt{flex:1;text-align:center;font-size:1.1rem;font-weight:800}

/* 上に置く合計（一番知りたい数字を一番近くに） */
.app .top{display:flex;gap:.4rem;margin-bottom:.7rem}
.app .top div{flex:1;background:var(--card);border:1px solid var(--line);border-radius:12px;
  padding:.4rem .3rem .5rem;text-align:center}
.app .top .k{font-size:.78rem;color:var(--ink2)}
.app .top .v{font-size:1.05rem;font-weight:800;line-height:1.3}
.app .top .yet .v{color:var(--yet)}

/* 催促の帯 */
.app .nag{display:flex;align-items:center;gap:.5rem;background:var(--yet);color:#fff;
  border-radius:12px;padding:.6rem .6rem;margin-bottom:.7rem}
.app .nag .tx{flex:1}
.app .nag .tx b{display:block;font-size:.95rem;font-weight:800;line-height:1.35}
.app .nag .tx span{font-size:.8rem}

/* 入金の行 */
.app .row{display:flex;align-items:center;gap:.5rem;background:var(--card);
  border:1px solid var(--line);border-radius:14px;padding:.5rem .5rem .5rem .6rem;margin-bottom:.5rem}
.app .row .who{flex:1;min-width:0}
.app .row .l1{display:flex;align-items:baseline;gap:.4rem;flex-wrap:wrap}
.app .row .rm{font-size:1.05rem;font-weight:800}
.app .row .nm{font-size:.9rem;font-weight:700}
.app .row .way{display:inline-flex;align-items:center;gap:.15rem;font-size:.74rem;font-weight:700;
  color:var(--ink2);background:#F1EFE9;border:1px solid var(--line);border-radius:999px;padding:.05rem .5rem}
.app .row .mn{font-size:.92rem;font-weight:700;margin-top:.1rem}
.app .row .sub{display:block;font-size:.78rem;color:var(--ink2)}

/* 状態ボタン：未を強く、済を静かに */
.app .st{width:7.1rem;min-height:3.9rem;flex:none;border-radius:13px;border:2px solid;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.05rem;font-weight:800}
.app .st .k{font-size:1.25rem;line-height:1.15}
.app .st .e{font-size:.74rem;font-weight:700}
.app .st.done{background:var(--done-weak);border-color:var(--done);color:var(--done)}
.app .st.yet{background:var(--yet);border-color:var(--yet);color:#fff}
.app .st.wait{background:var(--wait-weak);border-color:var(--wait);color:var(--wait);border-style:dashed}
.app .row.empty{background:#F2F0EA;color:var(--ink2)}
.app .row .none{width:7.1rem;text-align:center;font-size:.8rem;color:var(--ink2);font-weight:700}

/* 下部の常設ボタン */
.app .foot{display:flex;gap:.4rem;padding:.5rem .7rem calc(.6rem + env(safe-area-inset-bottom));
  background:var(--card);border-top:1px solid var(--line)}
.app .foot .fb{flex:1;min-height:3.4rem;border-radius:13px;border:2px solid var(--navy);
  background:var(--navy);color:#fff;font-size:.88rem;font-weight:800;
  display:flex;align-items:center;justify-content:center;gap:.3rem}
.app .foot .fb.g{background:var(--card);color:var(--navy)}

/* もとにもどす（8秒間出る） */
.app .toast{display:flex;align-items:center;gap:.6rem;background:#20211C;color:#fff;
  border-radius:13px;padding:.55rem .6rem;margin:.6rem 0}
.app .toast .tx{flex:1;font-size:.85rem;font-weight:700}
.app .toast .ub{min-height:3rem;padding:0 .8rem;border-radius:10px;background:#fff;color:#20211C;
  font-size:.85rem;font-weight:800;display:flex;align-items:center;gap:.25rem}

/* 確認ダイアログ */
.app .dim{background:rgba(23,24,20,.55);padding:1.2rem .8rem;display:flex;align-items:center;min-height:100%}
.app .dlg{background:var(--card);border-radius:18px;padding:1rem .9rem;width:100%}
.app .dlg h3{margin:0 0 .3rem;font-size:1.05rem}
.app .dlg p{margin:0 0 .9rem;font-size:.85rem;color:var(--ink2)}
.app .dlg .b1,.app .dlg .b2{min-height:3.6rem;border-radius:13px;display:flex;align-items:center;
  justify-content:center;font-size:.95rem;font-weight:800;margin-bottom:.5rem}
.app .dlg .b1{background:var(--yet);color:#fff}
.app .dlg .b2{background:var(--card);border:2px solid var(--line);color:var(--ink)}

/* 詳細画面 */
.app dl{margin:0 0 .9rem;border-top:1px solid var(--line)}
.app dl div{display:flex;gap:.6rem;padding:.55rem .2rem;border-bottom:1px solid var(--line)}
.app dl dt{width:35%;flex:none;color:var(--ink2);font-size:.82rem;margin:0}
.app dl dd{margin:0;flex:1;font-size:.92rem;font-weight:700}
.app .head{background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:.7rem;text-align:center;margin-bottom:.8rem}
.app .head .rm{font-size:1.5rem;font-weight:800}
.app .head .nm{font-size:1rem;font-weight:700}
.app .log{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.6rem .7rem}
.app .log h4{margin:0 0 .4rem;font-size:.86rem;color:var(--ink2)}
.app .log li{font-size:.82rem;margin-bottom:.25rem}
.app .log ul{margin:0;padding-left:1.1em}

/* 控えを送る画面 */
.app .lead2{font-size:.88rem;color:var(--ink2);margin:0 0 .9rem}
.app .big{min-height:4.6rem;border-radius:15px;background:var(--done);color:#fff;
  display:flex;align-items:center;justify-content:center;gap:.4rem;font-size:1.05rem;font-weight:800;margin-bottom:.6rem}
.app .big.sub2{background:var(--card);color:var(--navy);border:2px solid var(--navy);min-height:3.8rem;font-size:.95rem}
.app .files{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.6rem .7rem;margin-bottom:.8rem}
.app .files li{font-size:.82rem;margin-bottom:.3rem}
.app .files ul{margin:.2rem 0 0;padding-left:1.1em}
.app .last{font-size:.82rem;color:var(--yet);font-weight:700}

/* 印刷用の1枚 */
.paper{background:#fff;color:#000;padding:1.1rem 1rem;font-size:.78rem}
.paper h2{font-size:1.05rem;margin:0 0 .1rem;text-align:center}
.paper .sub{text-align:center;font-size:.76rem;margin:0 0 .8rem}
.paper table{width:100%;border-collapse:collapse}
.paper th,.paper td{border:1px solid #000;padding:.3rem .35rem;font-size:.76rem}
.paper th{background:#EDEDED}
.paper td.r{text-align:right;font-variant-numeric:tabular-nums}
.paper td.c{text-align:center}
.paper .tot{font-weight:800}
.paper .sign{margin-top:.9rem;font-size:.72rem;display:flex;justify-content:space-between}
`;

/* ---------------- 画面の部品 ---------------- */
const bar = (title, back=true) =>
  `<div class="bar">${back ? `<span class="bk">${I.left(24)}もどる</span>` : `<span class="sp"></span>`}
   <span class="ttl">${title}</span><span class="sp"></span></div>`;

const foot = `<div class="foot"><span class="fb g">${I.home(24)}ホーム</span>
  <span class="fb">${I.send(24)}控えを家族に送る</span></div>`;

const ST = {
  done: `<span class="st done"><span class="k">済</span><span class="e">入りました</span></span>`,
  yet:  `<span class="st yet"><span class="k">未</span><span class="e">まだです</span></span>`,
  wait: `<span class="st wait"><span class="k">通帳</span><span class="e">まだ見てない</span></span>`
};
const WAY = { te:`${I.hand(15)}手渡し`, furi:`${I.book(15)}振込` };

const rows = () => ROWS.map(r => {
  if (r.state === "empty") return `<div class="row empty"><span class="who">
    <span class="l1"><span class="rm num">${r.no}</span><span class="nm">空室</span></span></span>
    <span class="none">—</span></div>`;
  return `<div class="row"><span class="who">
    <span class="l1"><span class="rm num">${r.no}</span><span class="nm">${r.name}</span>
      <span class="way">${WAY[r.way]}</span></span>
    <span class="mn num">${yen(r.amount)}</span>
    ${r.state === "done" ? `<span class="sub">${r.on} に受け取り</span>`
      : r.note ? `<span class="sub">${r.note}</span>` : ""}
  </span>${ST[r.state]}</div>`;
}).join("");

const topSummary = `<div class="top">
  <div><span class="k">済</span><div class="v num">${cnt("done")}件</div><span class="k num">${yen(sum("done"))}</span></div>
  <div class="yet"><span class="k">未</span><div class="v num">${cnt("yet")}件</div><span class="k num">${yen(sum("yet"))}</span></div>
  <div><span class="k">通帳まち</span><div class="v num">${cnt("wait")}件</div><span class="k num">${yen(sum("wait"))}</span></div>
</div>`;

const monthbar = `<div class="month"><span class="mb">${I.left(26)}</span>
  <span class="mt num">${MONTH.label}</span><span class="mb">${I.right(26)}</span></div>`;

/* ---------------- 画面 ---------------- */
const S = {};

S.main = `${bar("家賃の入金", false)}<div class="body">
  ${monthbar}${topSummary}${rows()}</div>${foot}`;

S.nag = `${bar("家賃の入金", false)}<div class="body">
  ${monthbar}
  <div class="nag">${I.alert(30)}<span class="tx"><b>12日ぶんの記録が、まだ家族に送られていません</b>
    <span>前に送ったのは 7月29日です</span></span>${I.right(24)}</div>
  ${topSummary}
  <div class="toast"><span class="tx">104号室を「済」にしました</span>
    <span class="ub">${I.undo(20)}もとにもどす</span></div>
  ${rows()}</div>${foot}`;

S.dialog = `${bar("家賃の入金", false)}<div class="dim"><div class="dlg">
  <h3>101号室を「未」にもどしますか？</h3>
  <p>8月3日に「受け取った」と記録されています。<br>もどすと、その記録が消えます。</p>
  <div class="b1">はい、まだ受け取っていません</div>
  <div class="b2">いいえ、このままにする</div>
</div></div>`;

S.detail = `${bar("101号室")}<div class="body">
  <div class="head"><div class="rm num">101号室</div><div class="nm">田中 一郎</div>
    <div style="margin-top:.4rem">${ST.done}</div></div>
  <dl>
    <div><dt>令和8年8月分</dt><dd class="num">${yen(61000)}</dd></div>
    <div><dt>受け取った日</dt><dd>8月3日（月）</dd></div>
    <div><dt>受け取り方</dt><dd>手渡し</dd></div>
    <div><dt>内わけ</dt><dd class="num">家賃 ${yen(58000)}／管理費 ${yen(3000)}</dd></div>
  </dl>
  <div class="log"><h4>この部屋の記録</h4><ul>
    <li>8月3日　済にした（じいちゃん）</li>
    <li>7月2日　済にした（じいちゃん）</li>
    <li>6月4日　いちど済にして、同じ日にもどした（じいちゃん）</li>
    <li>6月5日　済にした（じいちゃん）</li>
  </ul></div></div>`;

S.send = `${bar("控えを家族に送る")}<div class="body">
  <p class="lead2">スマホが壊れても、この控えがあれば元にもどせます。<br>
    月に一度、お孫さんかご家族に送ってください。</p>
  <div class="files"><b>送るもの（2つ）</b><ul>
    <li>もとにもどすためのファイル（家族が保管します）</li>
    <li>そのまま読める1枚の書類（開けば中身が見えます）</li>
  </ul></div>
  <div class="big">${I.send(28)}LINEなどで送る</div>
  <div class="big sub2">${I.print(24)}紙に印刷する</div>
  <p class="last">${"前に送ったのは 7月29日（12日前）です"}</p></div>`;

S.paper = `<div class="paper">
  <h2>${BLDG}　家賃入金表</h2>
  <p class="sub">令和8年8月分　（令和8年8月10日 現在）</p>
  <table><thead><tr><th>部屋</th><th>お名前</th><th>方法</th><th>金額</th><th>入金</th><th>受取日</th></tr></thead><tbody>
  ${ROWS.map(r => r.state === "empty"
    ? `<tr><td class="c">${r.no}</td><td colspan="5" class="c">空室</td></tr>`
    : `<tr><td class="c">${r.no}</td><td>${r.name}</td>
       <td class="c">${r.way === "te" ? "手渡し" : "振込"}</td>
       <td class="r">${r.amount.toLocaleString("ja-JP")}</td>
       <td class="c">${r.state === "done" ? "済" : r.state === "yet" ? "未" : "通帳まち"}</td>
       <td class="c">${r.on || ""}</td></tr>`).join("")}
  <tr class="tot"><td colspan="3" class="c">合計</td>
    <td class="r">${(sum("done")+sum("yet")+sum("wait")).toLocaleString("ja-JP")}</td>
    <td colspan="2" class="c">うち入金済 ${sum("done").toLocaleString("ja-JP")}</td></tr>
  </tbody></table>
  <div class="sign"><span>※この表は「あさひ荘 管理アプリ」から印刷しました</span><span>記入者：じいちゃん</span></div>
</div>`;

/* ---------------- 出力 ---------------- */
const SHOTS = [
  ["1. 今月の入金（ふだんの画面）", "起動するとこの画面。合計を一番上に置き、手渡しと振込を分けた", S.main, "app"],
  ["2. 催促と「もとにもどす」", "控えを12日送っていないと赤帯。押し間違いは8秒間もどせる", S.nag, "app"],
  ["3. 「未」にもどすときだけ確認", "済にするのは1タップ。消すほうだけ一度たずねる", S.dialog, "app"],
  ["4. 部屋ごとの記録", "いつ・どうやって受け取ったか。過去の操作も全部残る", S.detail, "app"],
  ["5. 控えを家族に送る", "「バックアップ」とは呼ばない。前に送った日を必ず出す", S.send, "app"],
  ["6. 印刷した紙", "確定申告と、仏間に置いておく用。スマホを持たない人にも渡せる", S.paper, "paper"]
];

const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>v1 家賃の入金｜画面デザイン</title><style>${CSS}</style></head>
<body><div class="wrap">
  <h1>v1「家賃の入金」画面デザイン</h1>
  <p class="lead">A案（信頼の青）の構造に、C案の大きさ・見やすさ、B案の言葉づかい（済・未・令和・控え）を入れたものです。
  まずはこの機能だけを作って、毎月使ってもらいます。<b>名前と金額は見本です。</b></p>
  <hr>
  <div class="grid">
    ${SHOTS.map(([t,d,body,cls]) => `<div class="item"><div class="cap"><b>${t}</b><span>${d}</span></div>
      <div class="frame ${cls}">${body}</div></div>`).join("")}
  </div>
  <hr>
  <div class="memo"><b>前回から直したところ</b>
  <ul>
    <li><b>手渡しと振込を分けた</b> — 振込は通帳を見るまで分からないので「通帳まち」という別の状態にし、赤くしない（毎日赤が5つ出ると開かなくなるため）</li>
    <li><b>「済」「未」に戻した</b> — 40年そう書いてきた言葉に合わせる。<b>未を赤く強く、済は静かに</b>（注意を向けるべきは未のほう）</li>
    <li><b>合計を一番上に</b> — 10行スクロールした先ではなく、月の切替のすぐ下に置く</li>
    <li><b>受け取った日と、操作の記録を残す</b> — 「先月払いました」と言われたときの根拠になる</li>
    <li><b>もとにもどす</b>を8秒間表示。<b>済→未に戻すときだけ</b>確認する</li>
    <li><b>控えを家族に送る</b>を主役のボタンに格上げし、前に送った日を常に表示。12日空いたら赤帯で催促</li>
    <li>文字は最小17px・すべて<b>rem</b>指定（端末の文字拡大に追随）。押す場所はすべて<b>64px以上</b></li>
    <li>下に<b>「ホーム」と「控えを送る」を常設</b>（画面の上端は片手だと親指が届かない）</li>
  </ul>
  <p style="margin:.8rem 0 0"><b>次にやること</b>：Day1の聞き取り（物件名・部屋・入居者・手渡しか振込か・過去の家賃変更）で、この見本を本物のデータに置きかえます。</p>
  </div>
</div></body></html>`;

fs.writeFileSync(path.join(DIR, "v1-payments.html"), html, "utf8");
console.log("書き出しました: design/v1-payments.html （" + SHOTS.length + "画面）");
