// ============================================================
// app.js — QUẢN LÝ CHUNG: 2 tab (Báo cáo tháng / Danh sách chi tiết)
//  - đọc data từ window.__DATA__ (nhúng) hoặc fetch('data.json')
//  - tab chi tiết: tìm kiếm, lọc, sort
//  - SỬA TAY (thêm/sửa/xóa) cần MẬT KHẨU, lưu trên máy người sửa
//  - "Tải JSON đã sửa" -> xuất data.json đã chỉnh để đẩy lại GitHub
// ============================================================
(function(){
  const EDIT_PASS='1398';   // mật khẩu mở chế độ sửa tay
  const LUONG_MIN=15;       // RULE: NCT ở >= 15 ngày trong tháng thì được tính lương/tính đủ tháng.
                            // Đổi 1 chỗ này là đổi hết: nhãn đếm, màu ô "Số ngày ở", cột xuất Excel.

  const ZCOLS=[
    ['label','Cơ sở','l'],['nhapMoi','Nhập mới'],['chuyenNB','Điều chuyển NB'],['veLai','Xuất viện về khu lại'],
    ['hienHuu','Hiện hữu'],['tamVang','Tạm vắng'],['thuocKhu','Thuộc khu (KT)'],['giuong','Số giường'],['lapDay','Lấp đầy (%)','yellow'],
    ['tongXuat','Tổng xuất'],['tuVong','Tử vong'],['thanhLy','Thanh lý HĐ'],['dieuChuyen','Điều chuyển nội bộ'],['diVien','Đi viện']
  ];
  const DCOLS=[['ct','Chỉ tiêu'],['zone','Khu'],['ma','Mã'],['ten','Họ tên','l'],['ngay','Ngày'],['days','Số ngày ở (trong tháng)'],['cs','Cơ sở/Phòng','l'],['ck','Còn trong khu'],['gc','Ghi chú','l']];
  const esc=s=>(s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const norm=s=>(s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function hl(s,kw){if(!kw)return esc(s);const n=norm(s),k=norm(kw),i=n.indexOf(k);if(i<0)return esc(s);
    return esc(s.slice(0,i))+'<mark>'+esc(s.slice(i,i+kw.length))+'</mark>'+esc(s.slice(i+kw.length));}

  let MONTH='', BASE=[], totalsRef=null, REF=null, REFSTART=null, KPIBASE=[], DADJUST=[];
  let HHDAYS=new Map(); // mã (chỉ số) -> số ngày ở, lấy từ dòng HIỆN HỮU của chính người đó
  const digOnly=x=>{const m=String(x==null?'':x).match(/\d+/g);return m?m.join(''):'';};
  function parseDay(s){const m=String(s||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);return m?Date.UTC(+m[1],+m[2]-1,+m[3]):null;}
  function refDate(){const m=String(MONTH||'').match(/^(\d{4})-(\d{1,2})/);if(!m)return Date.now();return Date.UTC(+m[1],+m[2],0);} // ngày cuối tháng báo cáo
  function refStart(){const m=String(MONTH||'').match(/^(\d{4})-(\d{1,2})/);if(!m)return 0;return Date.UTC(+m[1],+m[2]-1,1);} // ngày đầu tháng báo cáo
  function daysOf(r){ // SỐ NGÀY THỰC Ở trong tháng (đã trừ đi viện + về nhà). Ưu tiên số tính sẵn từ node.
    if(r.songay!=null&&r.songay!=='')return Number(r.songay);
    if(/^[12]\./.test(r.ct)){ // HIỆN HỮU / HĐ MỚI: tính theo ngày vào -> cuối tháng
      const d=parseDay(r.ngay); if(d==null)return null;
      const start=Math.max(d,REFSTART);
      if(start>REF)return 0;
      return Math.floor((REF-start)/86400000)+1;
    }
    // RULE: bất kỳ dòng nào của người ĐANG HIỆN HỮU (mã có trong HHDAYS) -> mượn số ngày ở của họ.
    // (xuất viện về khu lại, đi viện đã về, khách hàng phát sinh...). Người đã rời khu -> để trống.
    const k=digOnly(r.ma);
    if(k && HHDAYS.has(k))return HHDAYS.get(k);
    return null;
  }
  function awayDays(r){

    if(r.soNgayDiVien!=null)
      return Number(r.soNgayDiVien)||0;
  
    if(r.soNgayVeNha!=null)
      return Number(r.soNgayVeNha)||0;
  
    if(r.diVienDays!=null)
      return Number(r.diVienDays)||0;
  
    if(r.veNhaDays!=null)
      return Number(r.veNhaDays)||0;
  
    const gc = String(r.gc||'');
  
    let m =
      gc.match(/đi viện.*?(\d+)/i) ||
      gc.match(/về nhà.*?(\d+)/i) ||
      gc.match(/(\d+)\s*ngày/i);
  
    return m ? Number(m[1]) : 0;
  }
  const rowKey=r=>[r.ct,r.ma,r.ten,r.ngay].join('|');
  const LSK=()=>'bcare_edit_'+MONTH;
  function loadEdits(){let e;try{e=JSON.parse(localStorage.getItem(LSK()))||{};}catch(_){e={};} e.edits=e.edits||{};e.deleted=e.deleted||[];e.added=e.added||[];e.kpi=e.kpi||{};return e;}
  function saveEdits(e){localStorage.setItem(LSK(),JSON.stringify(e));}
  function merged(){
    const e=loadEdits(), del=new Set(e.deleted);
    const rows=BASE.filter(r=>!del.has(rowKey(r))).map(r=>{const ov=e.edits[rowKey(r)];return ov?{...r,...ov,_edited:true}:r;});
    (e.added||[]).forEach(r=>rows.push({...r,_added:true}));
    return rows;
  }

  // ---------- TAB 1: bảng KPI (sửa tay được) ----------
  const AUTO=['tongXuat','lapDay','tamVang','thuocKhu']; // tự tính, không sửa tay
  // RULE: "Tạm vắng" = NCT đi viện/về nhà CHƯA VỀ (Còn trong khu=Không), nhận diện tự động từ danh sách chi tiết.
  // "Thuộc khu (KT)" = Hiện hữu + Tạm vắng = cách đếm của kế toán (tính cả người tạm vắng vẫn giữ giường).
  function tamVangByZone(){
    const hh=new Set((BASE||[]).filter(r=>/^1\./.test(r.ct)).map(r=>digOnly(r.ma)));
    const seen=new Set(); const cnt={};
    (BASE||[]).forEach(r=>{
      if(!/ĐI VIỆN|VỀ THĂM NHÀ/.test(r.ct))return;       // chỉ nhóm đi viện / về nhà
      if(String(r.ck||'').indexOf('Có')===0)return;       // đã về khu -> không phải tạm vắng
      const m=digOnly(r.ma); if(!m||hh.has(m)||seen.has(m))return; // đang hiện hữu hoặc đã đếm -> bỏ
      seen.add(m); cnt[r.zone]=(cnt[r.zone]||0)+1;
    });
    return cnt;
  }
  // ---------- DRILL-DOWN: bấm số trong bảng KPI -> mở đúng danh sách chi tiết ----------
  // Map chỉ tiêu KPI -> mẫu nhận dạng tên "Chỉ tiêu" (ct) trong danh sách chi tiết.
  // KHÔNG hardcode tên ct: dò trong dữ liệu thật lúc chạy. Nhờ vậy khi nào bổ sung dòng
  // TỬ VONG / THANH LÝ / ĐI VIỆN vào data.json là bấm ra danh sách được ngay, không sửa code.
  const DRILL={
    nhapMoi:/HĐ MỚI|HD MOI|NHẬP MỚI|PHÁT SINH/i,
    hienHuu:/HIỆN HỮU/i,
    thuocKhu:/HIỆN HỮU/i,
    veLai:/VỀ KHU LẠI|XUẤT VIỆN VỀ/i,
    tamVang:/ĐI VIỆN|VỀ THĂM NHÀ/i,
    chuyenNB:/ĐIỀU CHUYỂN NB|CHUYỂN NỘI BỘ ĐẾN/i,
    tuVong:/TỬ VONG/i,
    thanhLy:/THANH LÝ/i,
    dieuChuyen:/ĐIỀU CHUYỂN NỘI BỘ/i,
    diVien:/ĐI VIỆN/i
  };
  function fieldForCt(ct){ // ngược lại với ctFor: có sẵn 1 chuỗi ct -> field KPI tương ứng
    for(const f in DRILL){ if(DRILL[f].test(ct)) return f; }
    return null;
  }
  const NODRILL=['label','giuong','lapDay','tongXuat']; // không phải danh sách người -> không bấm
  function ctFor(field){
    const re=DRILL[field]; if(!re)return null;
    const hit=[...new Set(BASE.map(r=>r.ct))].filter(c=>re.test(c));
    return hit.length===1?hit[0]:null; // khớp đúng 1 nhóm mới lọc thẳng được
  }
  function showTab(name){
    document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
    document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===name));
  }
  let drillMsg='', drillNone=false;
  function expectedKpiVal(zone,field){
    // Lấy đúng số đã chốt trên bảng KPI (đã gộp chỉnh tay) cho 1 khu hoặc toàn hệ thống,
    // để so với số dòng chi tiết thật -> phát hiện "còn thiếu tên" mà không cần đụng vào số KPI.
    const kpi=mergedKPI(), totals=computeTotals(kpi);
    if(!zone) return totals[field];
    const r=kpi.find(x=>x.zone===zone); return r?r[field]:undefined;
  }
  function drill(zone,field){
    const ct=ctFor(field);
    const z=document.getElementById('z'),f=document.getElementById('f'),q=document.getElementById('q'),dayf=document.getElementById('dayf');
    q.value=''; if(dayf)dayf.value='';
    z.value=[...z.options].some(o=>o.value===zone)?zone:'';
    const zTxt=zone?('khu '+zone):'toàn hệ thống';
    if(ct){ f.value=ct; drillNone=false; }
    else {  // chưa có dòng chi tiết cho chỉ tiêu này -> trả về RỖNG + nói rõ lý do,
            // không được để lọt cả danh sách khu ra làm người đọc tưởng đó là danh sách đúng
      f.value=''; drillNone=true;
      drillMsg='⚠ Chỉ tiêu “'+ZLABEL(field)+'” ('+zTxt+') chỉ có SỐ TỔNG, chưa có danh sách tên trong data.json. '
        +'Lý do: 3 API customers / term / exit trả HTTP 400 ngày 31/07 nên số này được nhập tay từ báo cáo cơ sở. '
        +'Khi bổ sung dòng chi tiết cho chỉ tiêu này vào data.json thì bấm là ra danh sách ngay, không cần sửa code.';
    }
    showTab('detail'); renderDetail();
  }

  const ZLABEL=c=>{const x=ZCOLS.find(z=>z[0]===c);return x?x[1]:c;};
  function origVal(zone,field){const r=KPIBASE.find(x=>x.zone===zone);return r?r[field]:undefined;}
  // gộp chỉnh tay: từ data.json (adjust) + máy hiện tại (localStorage). key = 'zone|field' -> {new, note}
  function adjustMap(){
    const e=loadEdits(); const m={};
    (DADJUST||[]).forEach(a=>{m[a.zone+'|'+a.field]={new:a.new,note:a.note||''};});
    Object.entries(e.kpiAdj||{}).forEach(([k,v])=>{m[k]={new:v.v,note:v.note||''};});
    Object.keys(m).forEach(k=>{const[z,f]=k.split('|');if(AUTO.includes(f)||m[k].new===undefined||String(m[k].new)===String(origVal(z,f)))delete m[k];});
    return m;
  }
  function mergedKPI(){
    const m=adjustMap(); const tv=tamVangByZone();
    return KPIBASE.map(r=>{const o={...r}; ZCOLS.forEach(c=>{ if(c[0]==='label'||AUTO.includes(c[0]))return; const k=r.zone+'|'+c[0]; if(m[k]&&m[k].new!==''&&m[k].new!=null)o[c[0]]=m[k].new; });
      o.tongXuat=(Number(o.tuVong)||0)+(Number(o.thanhLy)||0)+(Number(o.dieuChuyen)||0)+(Number(o.diVien)||0); // tự cộng
      o.lapDay=Number(o.giuong)?Math.round((Number(o.hienHuu)||0)/Number(o.giuong)*1000)/10:0;                 // tự tính %
      o.tamVang=tv[r.zone]||0;                                   // RULE: đi viện/về nhà chưa về
      o.thuocKhu=(Number(o.hienHuu)||0)+o.tamVang;               // RULE: hiện hữu + tạm vắng (kế toán)
      return o;});
  }
  function computeTotals(arr){
    const s=k=>arr.reduce((a,r)=>a+(Number(r[k])||0),0);
    return {nhapMoi:s('nhapMoi'),chuyenNB:s('chuyenNB'),veLai:s('veLai'),hienHuu:s('hienHuu'),tamVang:s('tamVang'),thuocKhu:s('thuocKhu'),giuong:s('giuong'),
      lapDay:s('giuong')?Math.round(s('hienHuu')/s('giuong')*1000)/10:0,
      tongXuat:s('tongXuat'),tuVong:s('tuVong'),thanhLy:s('thanhLy'),dieuChuyen:s('dieuChuyen'),diVien:s('diVien'),ge15:s('ge15'),ge30:s('ge30')};
  }
  function setKpiAdj(zone,field,val){
    if(AUTO.includes(field))return; // Tổng xuất & Lấp đầy tự tính, không sửa tay
    const e=loadEdits(); e.kpiAdj=e.kpiAdj||{}; const k=zone+'|'+field;
    const num=String(val).replace(',','.'); const v=(num!==''&&!isNaN(num))?Number(num):val;
    if(String(v)===String(origVal(zone,field))){ if(e.kpiAdj[k]){delete e.kpiAdj[k].v; if(!e.kpiAdj[k].note)delete e.kpiAdj[k];} }
    else { e.kpiAdj[k]=e.kpiAdj[k]||{}; e.kpiAdj[k].v=v; }
    saveEdits(e); renderKPI();
  }
  function setKpiNote(key,note){const e=loadEdits();e.kpiAdj=e.kpiAdj||{};e.kpiAdj[key]=e.kpiAdj[key]||{};e.kpiAdj[key].note=note;saveEdits(e);}
  function renderKPI(){
    const kpi=mergedKPI(); const totals=computeTotals(kpi); const m=adjustMap();
    let h='<thead><tr>'+ZCOLS.map(c=>`<th class="${c[2]==='l'?'l':''}">${esc(c[1])}</th>`).join('')+'</tr></thead><tbody>';
    kpi.forEach(r=>{ h+='<tr>'+ZCOLS.map(c=>{
        if(c[0]==='label')return `<td class="l">${esc(r.label)}</td>`;
        const k=r.zone+'|'+c[0]; const adj=m[k]; const ov=origVal(r.zone,c[0]);
        const isAuto=AUTO.includes(c[0]);
        const canDrill=!editMode&&!NODRILL.includes(c[0]);
        const cls=(c[2]==='yellow'?'yellow ':'')+(adj?'adjusted ':'')+((editMode&&!isAuto)?'editcell':'')+(isAuto?'autocell':'')+(canDrill?' drill':'');
        const ed=(editMode&&!isAuto)?`contenteditable data-zone="${esc(r.zone)}" data-field="${c[0]}"`:'';
        const dr=canDrill?` data-dz="${esc(r.zone)}" data-df="${esc(c[0])}" title="Bấm để xem danh sách chi tiết"`:'';
        const extra=(adj&&!editMode)?` <small class="old">(cũ ${esc(ov)})</small>`:'';
        return `<td class="${cls}"${dr} ${ed}>${esc(r[c[0]])}${extra}</td>`;
      }).join('')+'</tr>'; });
    h+='<tr class="tot">'+ZCOLS.map((c,i)=>{
      if(i===0)return '<td class="l">TỔNG CỘNG</td>';
      const canDrill=!editMode&&!NODRILL.includes(c[0]);
      return '<td'+(canDrill?' class="drill" data-dz="" data-df="'+esc(c[0])+'" title="Bấm để xem danh sách toàn hệ thống"':'')+'>'+esc(totals[c[0]]??'')+'</td>';
    }).join('')+'</tr>';
    h+='</tbody>';
    document.getElementById('kpi').innerHTML=h;
    const t=document.getElementById('kpi');
    t.querySelectorAll('td.drill').forEach(td=>td.onclick=()=>drill(td.dataset.dz,td.dataset.df));
    if(editMode){ t.querySelectorAll('td[contenteditable]').forEach(td=>td.onblur=()=>{ setKpiAdj(td.dataset.zone,td.dataset.field,td.textContent.trim()); }); }
    // nhật ký chỉnh tay dưới bảng (ai cũng thấy)
    const log=document.getElementById('kpilog'); if(log){
      const items=Object.keys(m).map(k=>{const[z,f]=k.split('|');return {k,z,f,old:origVal(z,f),nw:m[k].new,note:m[k].note};});
      if(!items.length){ log.innerHTML=''; }
      else{
        const zlb=z=>{const r=KPIBASE.find(x=>x.zone===z);return r?r.label:z;};
        log.innerHTML='<div class="kpilog-h">📝 Số đã chỉnh tay (cũ → mới)'+(editMode?' — bấm ô trong bảng để sửa số, gõ lý do bên dưới':'')+'</div>'+
          '<table class="logtbl"><thead><tr><th class="l">Cơ sở</th><th class="l">Chỉ tiêu</th><th>Cũ (node)</th><th>Mới (sửa tay)</th><th class="l">Lý do</th></tr></thead><tbody>'+
          items.map(it=>'<tr><td class="l">'+esc(zlb(it.z))+'</td><td class="l">'+esc(ZLABEL(it.f))+'</td><td class="old">'+esc(it.old)+'</td><td class="newv">'+esc(it.nw)+'</td>'+
            '<td class="l gc" '+(editMode?'contenteditable data-logk="'+esc(it.k)+'"':'')+'>'+esc(it.note||'')+'</td></tr>').join('')+'</tbody></table>';
        if(editMode){ log.querySelectorAll('td[contenteditable]').forEach(td=>td.onblur=()=>{ setKpiNote(td.dataset.logk, td.textContent.trim()); }); }
      }
    }
  }

  // ---------- TAB 2: danh sách ----------
  let sortK='',dir=1,editMode=false,unlocked=false;
  // Lọc + sort + gộp người theo bộ điều khiển hiện tại (dùng chung cho hiển thị & xuất Excel)
  function currentRows(){
    if(drillNone)return []; // đang drill vào chỉ tiêu chưa có dòng chi tiết -> đúng là rỗng
    const q=document.getElementById('q'),f=document.getElementById('f'),z=document.getElementById('z');
    const kw=q.value.trim(),fct=f.value,fz=z.value,nk=norm(kw);
    const dayf=(document.getElementById('dayf')||{}).value||'';
    let rows=merged().filter(r=>(!fct||r.ct===fct)&&(!fz||r.zone===fz)&&(!kw||norm([r.ten,r.ma,r.gc,r.cs].join(' ')).includes(nk)));
    // bộ lọc số ngày: chỉ lọc trên dòng HIỆN HỮU (1 người 1 dòng) -> ra đúng danh sách như tính lương
    if(dayf){
      const test = dayf==='ge30'?(x=>x>=30) : dayf==='lt30'?(x=>x<30) : dayf==='ge15'?(x=>x>=15) : dayf==='lt15'?(x=>x<15) : null;
      if(test) rows=rows.filter(r=>{ if(!/^1\./.test(r.ct))return false; const x=daysOf(r); return x!=null && test(x); });
    }
    if(sortK)rows=rows.slice().sort((a,b)=>(norm(a[sortK])>norm(b[sortK])?1:-1)*dir);
    if((document.getElementById('dedup')||{}).checked){
      const m=new Map();
      rows.forEach(r=>{ const k=(r.ma&&String(r.ma).trim())||norm(r.ten);
        if(!m.has(k)){ m.set(k,{...r,_cts:[r.ct]}); }
        else { const e=m.get(k); if(!e._cts.includes(r.ct))e._cts.push(r.ct);
          if(/^[12]\./.test(r.ct)){ e.ct=r.ct; e.ngay=r.ngay; e.cs=r.cs; e.ck=r.ck; } }
      });
      rows=[...m.values()];
    }
    return rows;
  }
  function renderDetail(){
    const q=document.getElementById('q'),count=document.getElementById('count');
    const kw=q.value.trim();
    const rows=currentRows();
    // banner: 2 trường hợp cần nói rõ, áp dụng NGANG NHAU cho dù người dùng bấm số trong bảng
    // hay tự chọn tay ở dropdown "Chỉ tiêu" — tránh đúng lỗi cũ: chọn tay thì không có banner, gây hiểu lầm.
    // (1) chỉ tiêu chưa có dòng chi tiết nào (drillNone, chỉ xảy ra qua bấm số vì dropdown không có option đó)
    // (2) chỉ tiêu có dòng chi tiết nhưng ÍT hơn số đã chốt trên KPI -> "đã xác minh X/Y"
    let banner=drillMsg;
    if(!drillNone){
      const fctNow=f.value, fzNow=z.value;
      if(fctNow){
        const field=fieldForCt(fctNow);
        if(field){
          const expect=expectedKpiVal(fzNow,field);
          const actual=BASE.filter(r=>r.ct===fctNow&&(!fzNow||r.zone===fzNow)).length;
          if(typeof expect==='number'&&expect>actual){
            banner='⚠ Đã xác minh có tên/mã cho '+actual+'/'+expect+' người thuộc “'+ZLABEL(field)+'” ('+(fzNow?('khu '+fzNow):'toàn hệ thống')+'). '
              +(expect-actual)+' người còn lại vẫn là SỐ TỔNG cơ sở báo tay, chưa tra được tên trong Bcare — '
              +'không phải danh sách dưới đây bị thiếu, mà là chưa có đủ dữ liệu để liệt kê hết.';
          } else banner='';
        } else banner='';
      } else banner='';
    }
    let bn=document.getElementById('drillmsg');
    if(!bn){ bn=document.createElement('div'); bn.id='drillmsg'; bn.className='drillmsg';
      const p=document.getElementById('detail'); p.insertBefore(bn,p.querySelector('.tablewrap')); }
    bn.style.display=banner?'block':'none'; bn.textContent=banner;
    const head='<thead><tr>'+DCOLS.map(c=>`<th data-k="${c[0]}" class="${c[2]==='l'?'l':''}">${c[1]}</th>`).join('')+(editMode?'<th>Sửa</th>':'')+'</tr></thead>';
    const body='<tbody>'+rows.map(r=>{
      const rk=rowKey(r);
      const tag=r._added?' <span class="tag add">+</span>':(r._edited?' <span class="tag edt">sửa</span>':'');
      const tds=DCOLS.map(c=>{
        if(c[0]==='ct'){const cts=r._cts||[r.ct];return '<td>'+cts.map(x=>'<span class="badge">'+esc(x)+'</span>').join(' ')+tag+'</td>';}
        if(c[0]==='ck')return '<td class="'+(String(r.ck).indexOf('Có')===0?'yes':'no')+'" '+(editMode?'contenteditable data-k="ck" data-rk="'+esc(rk)+'"':'')+'>'+esc(r.ck)+'</td>';
        if(c[0]==='gc')return '<td class="gc" '+(editMode?'contenteditable data-k="gc" data-rk="'+esc(rk)+'"':'')+'>'+(editMode?esc(r.gc):hl(r.gc,kw))+'</td>';
        if(c[0]==='days'){const dd=daysOf(r);const cl=dd==null?'':(dd>=LUONG_MIN?'ge30':'u30');return '<td class="'+cl+'">'+(dd!=null?dd:'')+'</td>';} // class ge30/u30 = xanh/cam trong style.css
        const v=(c[0]==='ten'||c[0]==='ma')?hl(r[c[0]],kw):esc(r[c[0]]);
        return '<td class="'+(c[2]==='l'?'l':'')+'">'+v+'</td>';
      }).join('');
      const del=editMode?('<td><button class="del" data-rk="'+esc(rk)+'">xóa</button></td>'):'';
      return '<tr>'+tds+del+'</tr>';
    }).join('')+'</tbody>';
    const t=document.getElementById('dt');t.innerHTML=head+body;
    t.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>{const k=th.dataset.k;dir=(sortK===k?-dir:1);sortK=k;renderDetail();});
    if(editMode){
      t.querySelectorAll('td[contenteditable]').forEach(td=>td.onblur=()=>{
        const e=loadEdits(),rk=td.dataset.rk,k=td.dataset.k;
        e.edits[rk]=e.edits[rk]||{}; e.edits[rk][k]=td.textContent.trim(); saveEdits(e);
      });
      t.querySelectorAll('button.del').forEach(b=>b.onclick=()=>{
        if(!confirm('Xóa dòng này?'))return;
        const e=loadEdits(); if(!e.deleted.includes(b.dataset.rk))e.deleted.push(b.dataset.rk); saveEdits(e); renderDetail();
      });
    }
    const fz=(document.getElementById('z')||{}).value||'';
    // RULE: 1 người có thể nằm ở NHIỀU chỉ tiêu (vd cụ HĐ MỚI cũng có dòng HIỆN HỮU)
    //       => "dòng" KHÁC "người". Trước đây chỉ in số dòng nên [HH] hiện 104 > hiện hữu 101.
    const dedupOn=!!(document.getElementById('dedup')||{}).checked;
    const uniq=new Set(rows.map(r=>digOnly(r.ma)||norm(r.ten))).size;
    // Hiện hữu cuối tháng + phân nhóm số ngày ở: LUÔN tính trên toàn khu đang chọn,
    // vì đây là số dùng để tính lương. Không phụ thuộc ô tìm kiếm / lọc chỉ tiêu / lọc số ngày.
    const hh=merged().filter(r=>/^1\./.test(r.ct)&&(!fz||r.zone===fz));
    const nge=hh.filter(r=>{const x=daysOf(r);return x!=null&&x>=LUONG_MIN;}).length; const nlt=hh.filter(r=>{const x=daysOf(r);return x!=null&&x<LUONG_MIN;}).length;
    const isHH=r=>(r._cts||[r.ct]).some(x=>/^1\./.test(x));
    const narrowed=hh.length!==rows.filter(isHH).length; // chỉ nhắc khi tập đang xem thật sự ít hiện hữu hơn toàn khu
    const view='Hiển thị '+rows.length+(dedupOn?' người':' dòng'+(uniq!==rows.length?' ('+uniq+' người)':''));
    const kLabel=fz?('['+fz+'] '):'[Tất cả khu] ';
    count.textContent=view+' • '+kLabel+'Hiện hữu cuối tháng: '+hh.length+' = ≥'+LUONG_MIN+' ngày (lương) '+nge+' + <'+LUONG_MIN+' ngày '+nlt
      +(narrowed?' — số toàn khu, không theo bộ lọc':'')+(editMode?' • ĐANG SỬA':'');
  }

  function addRow(){
    const ct=prompt('Chỉ tiêu? (vd: 6. TỬ VONG)'); if(ct===null)return;
    const r={ct:ct||'(thêm tay)',zone:prompt('Khu? (HH/TCDB1/HLDB2/AH/NT/DQH/HHG)')||'',ma:prompt('Mã?')||'',
      ten:prompt('Họ tên?')||'',ngay:prompt('Ngày? (yyyy-mm-dd)')||'',cs:prompt('Cơ sở/Phòng?')||'',
      ck:prompt('Còn trong khu? (Có/Không)')||'',gc:prompt('Ghi chú?')||''};
    const e=loadEdits(); e.added.push(r); saveEdits(e); renderDetail();
  }
  function buildExport(){
    const m=adjustMap();
    const adjust=Object.keys(m).map(key=>{const[zone,field]=key.split('|');return {zone,field,old:origVal(zone,field),new:m[key].new,note:m[key].note||''};});
    return {month:MONTH,generatedAt:(new Date()).toLocaleString('vi-VN'),kpi:KPIBASE,adjust,totals:computeTotals(mergedKPI()),
      detail:merged().map(({_edited,_added,...r})=>r)};
  }
  function exportJSON(){
    const blob=new Blob([JSON.stringify(buildExport(),null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='data.json';a.click();
  }
  function resetEdits(){ if(confirm('Xóa hết chỉnh tay trên máy này?')){localStorage.removeItem(LSK());renderDetail();} }

  function toggleEdit(){
    if(!editMode && !unlocked){
      const p=prompt('Nhập mật khẩu để sửa:');
      if(p===null)return;
      if(p!==EDIT_PASS){alert('Sai mật khẩu.');return;}
      unlocked=true;
    }
    editMode=!editMode;
    document.getElementById('editToggle').classList.toggle('on',editMode);
    document.getElementById('editToggle').textContent=editMode?'✎ Đang sửa (bấm để khóa)':'✎ Sửa tay';
    document.getElementById('editTools').style.display=editMode?'inline':'none';
    const ar=document.getElementById('addRow'); if(ar)ar.style.display=editMode?'inline-block':'none';
    renderKPI(); renderDetail();
  }


  // ---------- XUẤT EXCEL (.xlsx thuần, không cần thư viện) ----------
  function xlsxBlob(sheets){
    const enc=new TextEncoder();
    const CRC=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
    const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
    const cat=arr=>{let n=arr.reduce((a,x)=>a+x.length,0),o=new Uint8Array(n),p=0;arr.forEach(a=>{o.set(a,p);p+=a.length;});return o;};
    const L16=n=>new Uint8Array([n&255,(n>>8)&255]);
    const L32=n=>new Uint8Array([n&255,(n>>8)&255,(n>>16)&255,(n>>>24)&255]);
    const xesc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const colL=n=>{let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26;}return s;};
    function sheetXml(rows){let sd='<sheetData>';rows.forEach((row,ri)=>{sd+='<row r="'+(ri+1)+'">';row.forEach((v,ci)=>{const ref=colL(ci+1)+(ri+1);
      if(typeof v==='number'&&isFinite(v))sd+='<c r="'+ref+'"><v>'+v+'</v></c>';
      else sd+='<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xesc(v)+'</t></is></c>';});sd+='</row>';});sd+='</sheetData>';
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+sd+'</worksheet>';}
    const files=[];
    files.push({n:'[Content_Types].xml',d:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'});
    files.push({n:'_rels/.rels',d:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'});
    files.push({n:'xl/workbook.xml',d:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xesc(s.name).slice(0,31)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'});
    files.push({n:'xl/_rels/workbook.xml.rels',d:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>'});
    sheets.forEach((s,i)=>files.push({n:'xl/worksheets/sheet'+(i+1)+'.xml',d:sheetXml(s.rows)}));
    // zip store
    const locals=[],centrals=[];let off=0;
    files.forEach(f=>{const nb=enc.encode(f.n),data=enc.encode(f.d),crc=crc32(data);
      const lh=cat([L32(0x04034b50),L16(20),L16(0),L16(0),L16(0),L16(0),L32(crc),L32(data.length),L32(data.length),L16(nb.length),L16(0)]);
      locals.push(lh,nb,data);
      const ch=cat([L32(0x02014b50),L16(20),L16(20),L16(0),L16(0),L16(0),L16(0),L32(crc),L32(data.length),L32(data.length),L16(nb.length),L16(0),L16(0),L16(0),L16(0),L32(0),L32(off)]);
      centrals.push(ch,nb);off+=lh.length+nb.length+data.length;});
    const lp=cat(locals),cp=cat(centrals);
    const eo=cat([L32(0x06054b50),L16(0),L16(0),L16(files.length),L16(files.length),L32(cp.length),L32(lp.length),L16(0)]);
    return new Blob([cat([lp,cp,eo])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function exportExcel(){
    const kpi=mergedKPI(), totals=computeTotals(kpi);
    const h1=['Cơ sở','Nhập mới','Điều chuyển NB','Xuất viện về khu lại','Hiện hữu','Số giường','Lấp đầy (%)','Tổng xuất','Tử vong','Thanh lý HĐ','Điều chuyển nội bộ','Đi viện'];
    const KK=['label','nhapMoi','chuyenNB','veLai','hienHuu','giuong','lapDay','tongXuat','tuVong','thanhLy','dieuChuyen','diVien'];
    const s1=[h1, ...kpi.map(r=>KK.map(k=>r[k])), ['TỔNG CỘNG',totals.nhapMoi,totals.chuyenNB,totals.veLai,totals.hienHuu,totals.giuong,totals.lapDay,totals.tongXuat,totals.tuVong,totals.thanhLy,totals.dieuChuyen,totals.diVien]];
    const h2=['Chỉ tiêu','Khu','Mã','Họ tên','Ngày','Số ngày ở (trong tháng)','Cơ sở/Phòng','Còn trong khu','Ghi chú'];
    const s2=[h2, ...currentRows().map(r=>[(r._cts?r._cts.join(' + '):r.ct),r.zone,r.ma,r.ten,r.ngay,(daysOf(r)??''),r.cs,r.ck,r.gc])];
    const blob=xlsxBlob([{name:'Báo cáo tháng',rows:s1},{name:'Danh sách chi tiết',rows:s2}]);
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='BCARE_BaoCao_'+(MONTH||'thang')+'.xlsx';a.click();
  }

  // ---------- boot ----------
  function boot(d){
    MONTH=d.month||''; BASE=(d.detail||[]).slice(); totalsRef=d.totals||null; KPIBASE=(d.kpi||[]).slice(); DADJUST=(d.adjust||[]); window.__KPI__=KPIBASE; REF=refDate(); REFSTART=refStart();
    HHDAYS=new Map(); // số ngày ở của từng người đang hiện hữu (để dòng "xuất viện về/đi viện đã về" mượn lại)
    BASE.forEach(r=>{ if(/^1\./.test(r.ct)){ const v=daysOf(r); const k=digOnly(r.ma); if(v!=null&&k)HHDAYS.set(k,v); } });
    document.getElementById('sub').textContent='Tháng '+MONTH+(d.generatedAt?(' • cập nhật '+d.generatedAt):'');
    renderKPI();
    const f=document.getElementById('f'),z=document.getElementById('z');
    [...new Set(BASE.map(r=>r.ct))].sort().forEach(c=>{const o=document.createElement('option');o.value=o.textContent=c;f.appendChild(o);});
    [...new Set(BASE.map(r=>r.zone))].filter(Boolean).sort().forEach(zz=>{const o=document.createElement('option');o.textContent=zz;z.appendChild(o);});
    const rerender=()=>{drillMsg='';drillNone=false;renderDetail();}; // người dùng tự đổi lọc -> bỏ trạng thái drill
    document.getElementById('q').oninput=f.onchange=z.onchange=rerender;
    const dayf=document.getElementById('dayf'); if(dayf)dayf.onchange=rerender;
    const dd=document.getElementById('dedup'); if(dd)dd.onchange=renderDetail;
    document.getElementById('editToggle').onclick=toggleEdit;
    document.getElementById('addRow').onclick=addRow;
    document.getElementById('exportJSON').onclick=exportJSON;
    document.getElementById('exportExcel').onclick=exportExcel;
    document.getElementById('resetEdits').onclick=resetEdits;
    renderDetail();
  }
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  if(window.__DATA__)boot(window.__DATA__);
  else fetch('data.json?_='+Date.now()).then(r=>r.json()).then(boot).catch(e=>{document.getElementById('sub').textContent='Lỗi tải data.json: '+e;});
})();