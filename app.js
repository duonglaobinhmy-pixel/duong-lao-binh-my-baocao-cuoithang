// ============================================================
// app.js — QUẢN LÝ CHUNG: 2 tab (Báo cáo tháng / Danh sách chi tiết)
//  - đọc data từ window.__DATA__ (nhúng) hoặc fetch('data.json')
//  - tab chi tiết: tìm kiếm, lọc, sort
//  - SỬA TAY (thêm/sửa/xóa) cần MẬT KHẨU, lưu trên máy người sửa
//  - "Tải JSON đã sửa" -> xuất data.json đã chỉnh để đẩy lại GitHub
// ============================================================
(function(){
  const EDIT_PASS='1398';   // mật khẩu mở chế độ sửa tay

  const ZCOLS=[
    ['label','Cơ sở','l'],['nhapMoi','Nhập mới'],['chuyenNB','Điều chuyển NB'],['veLai','Xuất viện về khu lại'],
    ['hienHuu','Hiện hữu'],['giuong','Số giường'],['lapDay','Lấp đầy (%)','yellow'],
    ['tongXuat','Tổng xuất'],['tuVong','Tử vong'],['thanhLy','Thanh lý HĐ'],['dieuChuyen','Điều chuyển nội bộ'],['diVien','Đi viện']
  ];
  const DCOLS=[['ct','Chỉ tiêu'],['zone','Khu'],['ma','Mã'],['ten','Họ tên','l'],['ngay','Ngày'],['days','Số ngày ở'],['cs','Cơ sở/Phòng','l'],['ck','Còn trong khu'],['gc','Ghi chú','l']];
  const esc=s=>(s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const norm=s=>(s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function hl(s,kw){if(!kw)return esc(s);const n=norm(s),k=norm(kw),i=n.indexOf(k);if(i<0)return esc(s);
    return esc(s.slice(0,i))+'<mark>'+esc(s.slice(i,i+kw.length))+'</mark>'+esc(s.slice(i+kw.length));}

  let MONTH='', BASE=[], totalsRef=null, REF=null;
  function parseDay(s){const m=String(s||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);return m?Date.UTC(+m[1],+m[2]-1,+m[3]):null;}
  function refDate(){const m=String(MONTH||'').match(/^(\d{4})-(\d{1,2})/);if(!m)return Date.now();return Date.UTC(+m[1],+m[2],0);} // ngày cuối tháng báo cáo
  function daysOf(r){ // chỉ tính cho cụ đang ở (hiện hữu / hđ mới)
    if(!/^[12]\./.test(r.ct))return null;
    const d=parseDay(r.ngay); if(d==null)return null;
    return Math.max(0,Math.floor((REF-d)/86400000));
  }
  const rowKey=r=>[r.ct,r.ma,r.ten,r.ngay].join('|');
  const LSK=()=>'bcare_edit_'+MONTH;
  function loadEdits(){try{return JSON.parse(localStorage.getItem(LSK()))||{edits:{},deleted:[],added:[]};}catch(e){return{edits:{},deleted:[],added:[]};}}
  function saveEdits(e){localStorage.setItem(LSK(),JSON.stringify(e));}
  function merged(){
    const e=loadEdits(), del=new Set(e.deleted);
    const rows=BASE.filter(r=>!del.has(rowKey(r))).map(r=>{const ov=e.edits[rowKey(r)];return ov?{...r,...ov,_edited:true}:r;});
    (e.added||[]).forEach(r=>rows.push({...r,_added:true}));
    return rows;
  }

  // ---------- TAB 1: bảng KPI ----------
  function renderKPI(kpi,totals){
    let h='<thead><tr>'+ZCOLS.map(c=>`<th class="${c[2]==='l'?'l':''}">${esc(c[1])}</th>`).join('')+'</tr></thead><tbody>';
    kpi.forEach(r=>{h+='<tr>'+ZCOLS.map(c=>`<td class="${c[2]==='l'?'l':''} ${c[2]==='yellow'?'yellow':''}">${esc(r[c[0]])}</td>`).join('')+'</tr>';});
    if(totals)h+='<tr class="tot">'+ZCOLS.map((c,i)=>`<td class="${c[2]==='l'?'l':''}">${esc(i===0?'TỔNG CỘNG':(totals[c[0]]??''))}</td>`).join('')+'</tr>';
    h+='</tbody>';document.getElementById('kpi').innerHTML=h;
  }

  // ---------- TAB 2: danh sách ----------
  let sortK='',dir=1,editMode=false,unlocked=false;
  function renderDetail(){
    const q=document.getElementById('q'),f=document.getElementById('f'),z=document.getElementById('z'),count=document.getElementById('count');
    const kw=q.value.trim(),fct=f.value,fz=z.value,nk=norm(kw);
    const dayf=(document.getElementById('dayf')||{}).value||'';
    let rows=merged().filter(r=>(!fct||r.ct===fct)&&(!fz||r.zone===fz)&&(!kw||norm([r.ten,r.ma,r.gc,r.cs].join(' ')).includes(nk)));
    if(dayf==='ge30')rows=rows.filter(r=>{const x=daysOf(r);return x!=null&&x>=30;});
    else if(dayf==='lt30')rows=rows.filter(r=>{const x=daysOf(r);return x!=null&&x<30;});
    if(sortK)rows=rows.slice().sort((a,b)=>(norm(a[sortK])>norm(b[sortK])?1:-1)*dir);
    const head='<thead><tr>'+DCOLS.map(c=>`<th data-k="${c[0]}" class="${c[2]==='l'?'l':''}">${c[1]}</th>`).join('')+(editMode?'<th>Sửa</th>':'')+'</tr></thead>';
    const body='<tbody>'+rows.map(r=>{
      const rk=rowKey(r);
      const tag=r._added?' <span class="tag add">+</span>':(r._edited?' <span class="tag edt">sửa</span>':'');
      const tds=DCOLS.map(c=>{
        if(c[0]==='ct')return '<td><span class="badge">'+esc(r.ct)+'</span>'+tag+'</td>';
        if(c[0]==='ck')return '<td class="'+(String(r.ck).indexOf('Có')===0?'yes':'no')+'" '+(editMode?'contenteditable data-k="ck" data-rk="'+esc(rk)+'"':'')+'>'+esc(r.ck)+'</td>';
        if(c[0]==='gc')return '<td class="gc" '+(editMode?'contenteditable data-k="gc" data-rk="'+esc(rk)+'"':'')+'>'+(editMode?esc(r.gc):hl(r.gc,kw))+'</td>';
        if(c[0]==='days'){const dd=daysOf(r);const cl=dd==null?'':(dd>=30?'ge30':'u30');return '<td class="'+cl+'">'+(dd!=null?dd:'')+'</td>';}
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
    const all=merged(); const nge=all.filter(r=>{const x=daysOf(r);return x!=null&&x>=30;}).length; const nlt=all.filter(r=>{const x=daysOf(r);return x!=null&&x<30;}).length;
    count.textContent='Hiển thị '+rows.length+' dòng • ≥30 ngày: '+nge+' • <30 ngày: '+nlt+(editMode?' • ĐANG SỬA':'');
  }

  function addRow(){
    const ct=prompt('Chỉ tiêu? (vd: 6. TỬ VONG)'); if(ct===null)return;
    const r={ct:ct||'(thêm tay)',zone:prompt('Khu? (HH/TCDB1/HLDB2/AH/NT/DQH/HHG)')||'',ma:prompt('Mã?')||'',
      ten:prompt('Họ tên?')||'',ngay:prompt('Ngày? (yyyy-mm-dd)')||'',cs:prompt('Cơ sở/Phòng?')||'',
      ck:prompt('Còn trong khu? (Có/Không)')||'',gc:prompt('Ghi chú?')||''};
    const e=loadEdits(); e.added.push(r); saveEdits(e); renderDetail();
  }
  function exportJSON(){
    const out={month:MONTH,generatedAt:(new Date()).toLocaleString('vi-VN'),kpi:window.__KPI__||[],totals:totalsRef,
      detail:merged().map(({_edited,_added,...r})=>r)};
    const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
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
    document.getElementById('editTools').style.display=editMode?'flex':'none';
    renderDetail();
  }

  // ---------- boot ----------
  function boot(d){
    MONTH=d.month||''; BASE=(d.detail||[]).slice(); totalsRef=d.totals||null; window.__KPI__=d.kpi||[]; REF=refDate();
    document.getElementById('sub').textContent='Tháng '+MONTH+(d.generatedAt?(' • cập nhật '+d.generatedAt):'');
    renderKPI(d.kpi||[],d.totals);
    const f=document.getElementById('f'),z=document.getElementById('z');
    [...new Set(BASE.map(r=>r.ct))].sort().forEach(c=>{const o=document.createElement('option');o.value=o.textContent=c;f.appendChild(o);});
    [...new Set(BASE.map(r=>r.zone))].filter(Boolean).sort().forEach(zz=>{const o=document.createElement('option');o.textContent=zz;z.appendChild(o);});
    document.getElementById('q').oninput=f.onchange=z.onchange=renderDetail;
    const dayf=document.getElementById('dayf'); if(dayf)dayf.onchange=renderDetail;
    document.getElementById('editToggle').onclick=toggleEdit;
    document.getElementById('addRow').onclick=addRow;
    document.getElementById('exportJSON').onclick=exportJSON;
    document.getElementById('resetEdits').onclick=resetEdits;
    renderDetail();
  }
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');document.getElementById(b.dataset.tab).classList.add('active');
  });
  if(window.__DATA__)boot(window.__DATA__);
  else fetch('data.json?_='+Date.now()).then(r=>r.json()).then(boot).catch(e=>{document.getElementById('sub').textContent='Lỗi tải data.json: '+e;});
})();
