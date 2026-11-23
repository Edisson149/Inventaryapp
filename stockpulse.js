


/* ===================== CONFIG / ESTADO ===================== */
var SEED={"company":{"id":"1234567890","name":"EL REY DE LOS LICORES","nit":"900.000.000-1","sector":"Comercio de licores","sedePrincipal":"Sede Principal"},"users":[],"inventories":[],"traceability":[],"integration":{"url":"https://script.google.com/macros/s/AKfycbyw7yfXBvMt5fqsTGq8gYROP5x5DduHuRUebzPV2MDRYRQe_KOp6G1zx9biIpIC2tqEIA/exec","auto":true,"lastSyncAt":null,"lastSyncStatus":"idle","lastSyncMessage":"","spreadsheetUrl":""},"audit":[]};
var MEM={};
function stGet(w,k){try{return window[w].getItem(k)}catch(e){return MEM[w+k]!==undefined?MEM[w+k]:null}}
function stSet(w,k,v){try{window[w].setItem(k,v)}catch(e){MEM[w+k]=v}}
function stDel(w,k){try{window[w].removeItem(k)}catch(e){delete MEM[w+k]}}
var APP_VERSION='4.1';
window.addEventListener('error',function(e){try{toast('error','Ocurrió un error inesperado','Intente de nuevo. Si persiste, recargue la página.')}catch(x){}});
window.addEventListener('unhandledrejection',function(e){try{toast('error','Ocurrió un error inesperado','Intente de nuevo. Si persiste, recargue la página.')}catch(x){}});
var KEY='stockpulse_v2_'+SEED.company.id;
var ROLES={ADMIN:'Administrador',SUPERVISOR:'Supervisor / Auditor',OPERARIO:'Operario / Contador',CONSULTOR:'Consultor'};
var PERM={createInv:['ADMIN','SUPERVISOR'],count:['ADMIN','SUPERVISOR','OPERARIO'],toggleTheo:['ADMIN','SUPERVISOR'],
  recount:['ADMIN','SUPERVISOR'],doRecount:['ADMIN','SUPERVISOR','OPERARIO','CONSULTOR'],correctFinal:['SUPERVISOR'],finalize:['ADMIN','SUPERVISOR'],
  reports:['ADMIN','SUPERVISOR','CONSULTOR'],users:['ADMIN'],settings:['ADMIN'],deleteInv:['ADMIN']};
var S=loadState(), session=null, ui={view:'dashboard',invId:null,tab:'ALL',q:'',cq:'',cf:'pending',stage:{rows:[],warnings:[],fileName:''},tq:''};
function $(s,r){return (r||document).querySelector(s)}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clean(v){return String(v==null?'':v).replace(/[\u0000-\u001F\u007F<>]/g,'').trim().replace(/^[=+\-@\t\r]+/,'').trim()}
function pad(n){return String(n).padStart(2,'0')}
function now(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())}
function uid(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function randSalt(){var a=new Uint8Array(12);crypto.getRandomValues(a);return Array.prototype.map.call(a,function(x){return ('0'+x.toString(16)).slice(-2)}).join('')}
function stripSensitive(s){ // jamás se guardan usuarios, hashes, sales ni tokens en el navegador
  s.users=[];if(s.integration){delete s.integration.token}return s;
}
function persistable(s){var o=Object.assign({},s);o.users=[];return o}
function loadState(){
  try{var j=JSON.parse(stGet('localStorage',KEY));if(j&&j.inventories)return stripSensitive(j)}catch(e){}
  var s=JSON.parse(JSON.stringify(SEED));s.audit=[];stripSensitive(s);stSet('localStorage',KEY,JSON.stringify(persistable(s)));return s;
}
var bc=null;try{bc=new BroadcastChannel(KEY)}catch(e){}
var syncTimer=null;
function save(opts){
  opts=opts||{};
  stSet('localStorage',KEY,JSON.stringify(persistable(S)));
  if(bc)try{bc.postMessage('upd')}catch(e){}
  if(!opts.noSync&&session&&S.integration.auto&&S.integration.url){clearTimeout(syncTimer);syncTimer=setTimeout(function(){syncNow(true)},isSb()?100:1500)}
}
function audit(action,detail){S.audit=S.audit||[];S.audit.unshift({t:now(),u:session?session.username:'-',a:action,d:detail||''});S.audit.length=Math.min(S.audit.length,300)}
function vis(){return S.inventories.filter(function(i){return !i.deleted})}
function byId(id){return vis().find(function(i){return i.idInventario===id})}
function can(a){return !!session&&PERM[a].indexOf(session.role)>=0}
function need(a){if(!can(a))throw new Error('Su rol ('+(session?ROLES[session.role]:'-')+') no tiene permiso para esta acción.')}
function showTheo(inv){return !!inv.mostrarStockTeorico&&session&&session.role!=='OPERARIO'}
function hasCount(it){return it.conteo1!=null||it.conteo2!=null||it.conteoCorreccion!=null}
function finalQty(it){return it.conteoCorreccion??it.conteo2??it.conteo1??0}
function finalCountTime(it){return it.datetimeCorreccion||it.datetimeConteo2||it.datetimeConteo1||'-'}
function openInventory(inv){return !!inv&&!inv.deleted&&['PENDIENTE','EN_CURSO'].includes(inv.estado)}
function recountAction(inv,classes){if(!openInventory(inv))return '';
  var id=esc(inv.idInventario);
  if(inv.reconteoHabilitado&&can('doRecount'))return '<button class="'+classes+'" data-act="openRecount" data-id="'+id+'">2do conteo</button>';
  if(!inv.reconteoHabilitado&&can('recount'))return '<button class="'+classes+'" data-act="enableRecount" data-id="'+id+'">Autorizar 2do conteo</button>';
  return ''}
function accuracy(items){
  var tot=items.reduce(function(a,i){return a+i.stockTeorico},0);
  if(tot===0){var ok=items.filter(function(i){return finalQty(i)===i.stockTeorico}).length;return items.length?+(ok/items.length*100).toFixed(2):100}
  var c=items.filter(hasCount);if(!c.length)return 0;
  var base=c.reduce(function(a,i){return a+i.stockTeorico},0);if(base===0)return 100;
  var err=c.reduce(function(a,i){return a+Math.abs(finalQty(i)-i.stockTeorico)},0);
  return +Math.max(0,(1-err/base)*100).toFixed(2);
}
function touch(inv){inv.updatedAt=now()}
function fmtN(n){return Number(n).toLocaleString('es-CO')}
function dl(name,blob){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500)}

/* ===================== AUTENTICACIÓN (validada en el servidor) ===================== */
var SK=KEY+'_s',SP_INACTIVITY=30*60*1000;
function saveSess(last){stSet('sessionStorage',SK,JSON.stringify({s:session,last:Number.isFinite(last)?last:Date.now()}))}
async function serverLogin(user,pass){if(isSb())return sbLogin(user,pass);
  if(!S.integration.url)throw new Error('No hay un servidor configurado. Contacte al administrador del sistema.');
  srvRev=null;pushed={};var r=await gas('login',{username:String(user||'').trim(),password:pass||''},true);
  session=Object.assign({},r.user,{token:r.token});if(r.users)S.users=r.users;saveSess();audit('login','');save({noSync:true});return session;
}
function restoreSession(){
  try{var j=JSON.parse(stGet('sessionStorage',SK));if(j&&j.s&&j.s.token&&Date.now()-j.last<30*60000){session=j.s;return}}catch(e){}
  stDel('sessionStorage',SK);
}
async function refreshMe(){if(isSb())return;
  if(!session)return;
  try{var r=await gas('me');Object.assign(session,r.user);if(r.users)S.users=r.users;saveSess();save({noSync:true})}catch(e){}
}
function forceLogout(msg){sbStop();session=null;stDel('sessionStorage',SK);ui.view='dashboard';ui.loginErr=msg||'';try{closeModal()}catch(e){}render()}
function logout(){sbStop();if(session)audit('logout','');save({noSync:true});session=null;stDel('sessionStorage',SK);ui.view='dashboard';ui.loginErr='';render()}
function activity(){if(session)try{var j=JSON.parse(stGet('sessionStorage',SK));j.last=Date.now();stSet('sessionStorage',SK,JSON.stringify(j))}catch(e){}}
function pwOk(p){return p&&p.length>=8&&/[A-Za-z]/.test(p)&&/\d/.test(p)}

/* ===================== LÓGICA DE NEGOCIO ===================== */
function nextInvId(){
  var y=new Date().getFullYear(),mx=0;
  S.inventories.forEach(function(i){var m=/^INV-(\d{4})-(\d+)$/.exec(i.idInventario);if(m&&+m[1]===y)mx=Math.max(mx,+m[2])});
  return 'INV-'+y+'-'+pad3(mx+1);
}
function pad3(n){return String(n).padStart(3,'0')}
function createInventory(d){
  need('createInv');
  if(!d.rows.length)throw new Error('Debe incluir al menos un artículo.');
  var id=nextInvId(),n=0;
  var inv={idInventario:id,companyId:S.company.id,companyName:S.company.name,titulo:clean(d.titulo)||('Toma Física '+S.company.name),
    fechaRealizacion:now().slice(0,10),fechaHoraInicio:null,fechaHoraFin:null,duracionMinutos:0,
    responsable:clean(d.responsable)||session.name,auditor:clean(d.auditor)||session.name,estado:'PENDIENTE',
    mostrarStockTeorico:!!d.mostrarStockTeorico,reconteoHabilitado:false,indicadorExactitud:0,creadoPor:session.username,updatedAt:now(),
    items:d.rows.map(function(r,i){return {idDetalle:'det-'+id+'-'+(++n)+'-'+Math.random().toString(36).slice(2,5),idInventario:id,
      sku:clean(r.sku)||('SKU-'+n),barcode:clean(r.barcode),descripcion:clean(r.descripcion)||'Artículo sin descripción',
      categoriaMarca:clean(r.categoriaMarca),ubicacion:clean(r.ubicacion),stockTeorico:Math.round(Number(r.stockTeorico)||0),
      conteo1:null,conteo2:null,datetimeConteo1:null,datetimeConteo2:null,usuarioConteo1:null,usuarioConteo2:null,notas:'',requiereReconteo:false}})};
  S.inventories.unshift(inv);audit('crear_inventario',id+' ('+inv.items.length+' ítems)');save();return inv;
}
function startInventory(id){
  need('count');var inv=byId(id);if(!inv)throw new Error('Inventario no encontrado.');
  if(inv.estado==='FINALIZADO')throw new Error('El inventario ya fue finalizado.');
  if(inv.estado==='PENDIENTE'){inv.estado='EN_CURSO';inv.fechaHoraInicio=now();touch(inv);audit('iniciar',id);save()}return inv;
}
function toggleTheo(id,v){
  need('toggleTheo');var inv=byId(id);if(!inv)throw new Error('Inventario no encontrado.');
  if(inv.estado==='FINALIZADO')throw new Error('No se puede modificar un inventario finalizado.');
  inv.mostrarStockTeorico=v;touch(inv);audit('stock_teorico',id+' → '+(v?'visible':'ciego'));save();
}
function saveCount(id,itemId,qty,notes){
  need('count');var inv=byId(id);if(!inv)throw new Error('Inventario no encontrado.');
  if(inv.estado==='FINALIZADO')throw new Error('El inventario ya fue finalizado.');
  var it=inv.items.find(function(x){return x.idDetalle===itemId});if(!it)throw new Error('Artículo no encontrado.');
  qty=Number(qty);if(!isFinite(qty)||qty<0||Math.round(qty)!==qty)throw new Error('Ingrese una cantidad entera mayor o igual a 0.');
  var t=now();it.conteo1=qty;it.datetimeConteo1=t;it.usuarioConteo1=session.name;if(notes!=null)it.notas=clean(notes);
  if(inv.estado==='PENDIENTE'){inv.estado='EN_CURSO';inv.fechaHoraInicio=t}
  // si ya hay 2do conteo habilitado y cambia el 1er conteo, se re-evalúa la diferencia
  if(inv.reconteoHabilitado&&it.conteo2==null)it.requiereReconteo=it.conteo1!==it.stockTeorico;
  inv.indicadorExactitud=accuracy(inv.items);touch(inv);save();return it;
}
function addScanned(id,d){
  need('count');var inv=byId(id);if(!inv)throw new Error('Inventario no encontrado.');
  if(inv.estado==='FINALIZADO')throw new Error('El inventario ya fue finalizado.');
  var sku=clean(d.sku);if(!sku)throw new Error('El SKU es obligatorio.');
  if(inv.items.some(function(x){return x.sku.toLowerCase()===sku.toLowerCase()}))throw new Error('Ese SKU ya existe en este inventario.');
  var q=Math.round(Number(d.cantidad));if(!isFinite(q)||q<0)throw new Error('Cantidad inválida.');
  var t=now();
  var it={idDetalle:'det-sc-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),idInventario:id,sku:sku,barcode:clean(d.barcode)||sku,
    descripcion:clean(d.descripcion)||'Artículo añadido en campo',categoriaMarca:'Escaneado en Campo',ubicacion:clean(d.ubicacion)||'Bodega General',stockTeorico:0,
    conteo1:q,conteo2:null,datetimeConteo1:t,datetimeConteo2:null,usuarioConteo1:session.name,usuarioConteo2:null,notas:'Añadido vía escáner / manual en campo',requiereReconteo:false};
  inv.items.push(it);if(inv.estado==='PENDIENTE'){inv.estado='EN_CURSO';inv.fechaHoraInicio=t}
  if(inv.reconteoHabilitado)it.requiereReconteo=q!==0;
  inv.indicadorExactitud=accuracy(inv.items);touch(inv);audit('item_escaneado',id+' '+sku);save();return it;
}
function enableRecount(id){
  need('recount');var inv=byId(id);if(!inv)throw new Error('Inventario no encontrado.');
  if(inv.estado==='FINALIZADO')throw new Error('El inventario ya está finalizado.');
  var n=0;inv.items.forEach(function(i){i.requiereReconteo=(i.conteo1===null||i.conteo1!==i.stockTeorico);if(i.requiereReconteo)n++});
  inv.reconteoHabilitado=true;if(inv.estado==='PENDIENTE'){inv.estado='EN_CURSO';inv.fechaHoraInicio=inv.fechaHoraInicio||now()}
  touch(inv);audit('habilitar_2do_conteo',id+' ('+n+' ítems)');save();return n;
}
function saveRecount(id,itemId,qty,notes){
  need('doRecount');var inv=byId(id);if(!inv)throw new Error('Inventario no encontrado.');
  if(inv.estado==='FINALIZADO')throw new Error('El inventario ya fue finalizado.');
  var it=inv.items.find(function(x){return x.idDetalle===itemId});if(!it)throw new Error('Artículo no encontrado.');
  qty=Number(qty);if(!isFinite(qty)||qty<0||Math.round(qty)!==qty)throw new Error('Ingrese una cantidad entera mayor o igual a 0.');
  var t=now();if(it.conteo1===null){it.conteo1=qty;it.datetimeConteo1=t;it.usuarioConteo1=session.name}
  it.conteo2=qty;it.datetimeConteo2=t;it.usuarioConteo2=session.name;if(notes!=null)it.notas=clean(notes);
  inv.indicadorExactitud=accuracy(inv.items);touch(inv);save();
  return inv.items.filter(function(x){return x.requiereReconteo&&x.conteo2===null}).length;
}
function finalizeInventory(id){
  need('finalize');var inv=byId(id);if(!inv)throw new Error('Inventario no encontrado.');
  if(inv.estado==='FINALIZADO')return inv;
  var t=now(),st=inv.fechaHoraInicio||t,ms=Date.parse(st.replace(' ','T'));
  inv.items.forEach(function(i){if(i.conteo1===null){i.conteo1=0;i.datetimeConteo1=t;i.usuarioConteo1=inv.responsable}});
  inv.fechaHoraInicio=st;inv.fechaHoraFin=t;inv.duracionMinutos=isFinite(ms)?Math.max(1,Math.round((Date.now()-ms)/60000)):1;
  inv.estado='FINALIZADO';inv.indicadorExactitud=accuracy(inv.items);touch(inv);
  S.traceability=S.traceability.filter(function(r){return r.idInventario!==id});
  inv.items.forEach(function(i){var q=finalQty(i);S.traceability.unshift({idTrazabilidad:uid('tr-'),companyId:inv.companyId,companyName:inv.companyName,sku:i.sku,descripcion:i.descripcion,
    idInventario:id,tituloInventario:inv.titulo,fechaRegistro:i.datetimeConteo2||i.datetimeConteo1||t,stockTeorico:i.stockTeorico,cantidadContada:q,diferencia:q-i.stockTeorico,
    responsable:i.usuarioConteo2||i.usuarioConteo1||inv.responsable,notas:i.notas||''})});
  audit('finalizar',id+' exactitud '+inv.indicadorExactitud+'%');save();return inv;
}
function deleteInventory(id){
  need('deleteInv');var inv=byId(id);if(!inv)throw new Error('Inventario no encontrado.');
  if(inv.estado!=='PENDIENTE')throw new Error('Solo se pueden eliminar inventarios PENDIENTES.');
  inv.deleted=true;touch(inv);audit('eliminar_inventario',id);save();
}
/* usuarios (la validación real ocurre en el servidor) */
async function createUser(d){if(isSb())throw new Error('En modo Supabase los usuarios se administran en el panel de Supabase (Authentication y tabla profiles).');
  need('users');if(!pwOk(d.password))throw new Error('La contraseña debe tener mínimo 8 caracteres, con letras y números.');
  var r=await gas('user.create',d);S.users=r.users;audit('crear_usuario',d.username);save({noSync:true});return r.user;
}
async function updateUser(id,d){if(isSb())throw new Error('En modo Supabase los usuarios se administran en el panel de Supabase (Authentication y tabla profiles).');
  need('users');var r=await gas('user.update',Object.assign({id:id},d));S.users=r.users;
  if(session&&id===session.id)Object.assign(session,r.user);saveSess();audit('editar_usuario',r.user.username);save({noSync:true});return r.user;
}
async function deleteUser(id){if(isSb())throw new Error('En modo Supabase los usuarios se administran en el panel de Supabase (Authentication y tabla profiles).');need('users');var r=await gas('user.delete',{id:id});S.users=r.users;audit('eliminar_usuario',id);save({noSync:true})}
async function changeOwnPassword(cur,np){if(isSb()){if(!pwOk(np))throw new Error('La nueva contraseña debe tener mínimo 8 caracteres, con letras y números.');await sbEnsure();var rr=await sbc.auth.updateUser({password:np});if(rr.error)throw new Error(rr.error.message);session.mustChange=false;saveSess();return}
  if(!pwOk(np))throw new Error('La nueva contraseña debe tener mínimo 8 caracteres, con letras y números.');
  var r=await gas('password',{current:cur,npw:np});session.token=r.token;session.mustChange=false;saveSess();audit('cambio_password','');save({noSync:true});
}

/* ===================== IMPORTACIÓN ===================== */
var loaded={};
function loadScript(u,ms){return loaded[u]||(loaded[u]=new Promise(function(res,rej){
  var s=document.createElement('script'),timer=ms?setTimeout(failLoad,ms):null;s.src=u;
  function cleanLoad(){clearTimeout(timer);s.onload=s.onerror=null}
  function failLoad(){cleanLoad();s.remove();delete loaded[u];rej(new Error('No se pudo cargar una librería externa (¿sin conexión a internet?).'))}
  s.onload=function(){cleanLoad();res()};s.onerror=failLoad;document.head.appendChild(s)
}))}
var SP_SDK_ASSET=new URL('./vendor/supabase-2.45.4/supabase.js',document.baseURI).href;
var CDN={xlsx:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  jspdf:'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  autotable:'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  qr:'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  pdfjs:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfworker:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'};
function norm(s){return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'')}
function kind(h){var t=norm(h);if(!t)return null;
  if(/barcode|codigobarras|codbarras|barras|^ean|upc|gtin|^qr$|codigoqr/.test(t))return 'barcode';
  if(t==='sku'||/sku|^codigo$|^cod$|codarticulo|codproducto|codigoproducto|codigoarticulo|codigointerno|referencia$|^ref$|^plu$|idproducto|^material$|^item$/.test(t))return 'sku';
  if(/stock|teorico|cantidad|^cant$|existencia|saldo|disponible|inventario|unidades|^qty$/.test(t))return 'stock';
  if(/descripcion|nombre|producto|articulo|detalle/.test(t))return 'descripcion';
  if(/categoria|marca|familia|grupo|linea/.test(t))return 'categoria';
  if(/ubicacion|bodega|zona|pasillo|estante|sede|almacen/.test(t))return 'ubicacion';
  return null}
function num(v){
  if(typeof v==='number')return isFinite(v)?{v:Math.round(v),ok:true}:{v:0,ok:false};
  var t=String(v==null?'':v).trim();if(!t)return {v:0,ok:false};
  var n=t.replace(/[^0-9.,-]/g,'');if(!n||n==='-')return {v:0,ok:false};
  var r=n,d=n.indexOf('.')>=0,c=n.indexOf(',')>=0;
  if(d&&c)r=n.lastIndexOf(',')>n.lastIndexOf('.')?n.replace(/\./g,'').replace(',','.'):n.replace(/,/g,'');
  else if(d){if(/^-?\d{1,3}(\.\d{3})+$/.test(n))r=n.replace(/\./g,'')}
  else if(c){r=/^-?\d{1,3}(,\d{3})+$/.test(n)?n.replace(/,/g,''):n.replace(',','.')}
  var x=Number(r);return isFinite(x)?{v:Math.round(x),ok:true}:{v:0,ok:false};
}
function matrixToRows(m){
  var hi=-1,map={};
  for(var i=0;i<Math.min(m.length,30);i++){var cm={},hits=0;(m[i]||[]).forEach(function(h,j){var k=kind(h);if(k&&cm[k]===undefined){cm[k]=j;hits++}});
    if(hits>=2&&cm.stock!==undefined&&(cm.sku!==undefined||cm.descripcion!==undefined)){hi=i;map=cm;break}}
  if(hi<0)throw new Error('No se reconocieron los encabezados (SKU, Descripcion, Stock Teorico). Use la plantilla.');
  var rows=[],warn=[],zero=0,neg=0,san=0,bad=0;
  for(var r=hi+1;r<m.length;r++){var row=m[r]||[];if(!row.some(function(c){return String(c==null?'':c).trim()!==''}))continue;
    function g(k){return map[k]===undefined?'':row[map[k]]}
    var sk=g('sku'),ds=g('descripcion'),st=num(g('stock'));
    var o={sku:clean(sk),barcode:clean(g('barcode')),descripcion:clean(ds),categoriaMarca:clean(g('categoria')),ubicacion:clean(g('ubicacion')),stockTeorico:st.v};
    [[sk,o.sku],[ds,o.descripcion]].forEach(function(p){if(String(p[0]==null?'':p[0]).trim()!==p[1])san++});
    if(!o.sku&&!o.descripcion)continue;if(!st.ok)bad++;if(st.v===0)zero++;if(st.v<0)neg++;rows.push(o)}
  if(bad)warn.push(bad+' fila(s) sin stock numérico válido se cargaron con 0.');
  if(neg)warn.push(neg+' fila(s) con stock negativo.');if(zero)warn.push(zero+' fila(s) con stock teórico 0.');
  if(san)warn.push(san+' campo(s) sanitizados (caracteres de control o prefijos de fórmula).');
  var seen={},dup=0;rows.forEach(function(x){var k=x.sku.toLowerCase();if(seen[k])dup++;seen[k]=1});if(dup)warn.push(dup+' SKU duplicado(s).');
  return {rows:rows,warnings:warn};
}
function parseCSV(text){
  text=text.replace(/^﻿/,'');var first=text.split(/\r?\n/)[0]||'';
  var del=[';','\t',','].sort(function(a,b){return first.split(b).length-first.split(a).length})[0];
  var out=[],row=[],cur='',q=false;
  for(var i=0;i<text.length;i++){var ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=ch}
    else if(ch==='"')q=true;else if(ch===del){row.push(cur);cur=''}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cur);out.push(row);row=[];cur=''}
    else cur+=ch}
  if(cur!==''||row.length){row.push(cur);out.push(row)}return out;
}
async function importFile(file){
  var n=file.name.toLowerCase();
  if(!/\.(csv|xls|xlsx|pdf)$/.test(n))throw new Error('Formato no permitido. Use .csv, .xls, .xlsx o .pdf.');
  if(file.size>15*1024*1024)throw new Error('El archivo supera 15 MB.');
  if(n.endsWith('.csv'))return matrixToRows(parseCSV(await file.text()));
  if(n.endsWith('.pdf')){
    await loadScript(CDN.pdfjs);pdfjsLib.GlobalWorkerOptions.workerSrc=CDN.pdfworker;
    var pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise,lines=[];
    for(var p=1;p<=pdf.numPages;p++){var tc=await (await pdf.getPage(p)).getTextContent(),by={};
      tc.items.forEach(function(it){var y=Math.round(it.transform[5]/3);(by[y]=by[y]||[]).push(it)});
      Object.keys(by).map(Number).sort(function(a,b){return b-a}).forEach(function(y){lines.push(by[y].sort(function(a,b){return a.transform[4]-b.transform[4]}).map(function(i){return i.str.trim()}).filter(Boolean))})}
    var rows=[],warn=[];lines.forEach(function(c){if(c.length===1)c=c[0].split(/[;|\t]+/).map(function(x){return x.trim()}).filter(Boolean);
      if(c.length>=3){var st=num(c[c.length-1]);if(st.ok&&c[0].length<=32)rows.push({sku:clean(c[0]),barcode:'',descripcion:clean(c[1]),categoriaMarca:c.length>=4?clean(c[2]):'',ubicacion:'',stockTeorico:st.v})}});
    if(!rows.length)throw new Error('No se detectaron filas válidas en el PDF. Estructura esperada: SKU; Descripción; Categoría; Stock. (Los PDF escaneados no se pueden leer.)');
    warn.push('PDF leído por extracción de texto: revise la vista previa antes de crear el inventario.');return {rows:rows,warnings:warn};
  }
  await loadScript(CDN.xlsx);var wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
  if(!wb.SheetNames.length)throw new Error('El archivo no contiene hojas.');
  return matrixToRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''}));
}

/* ===================== EXPORTACIÓN ===================== */
function csvOf(rows){if(!rows.length)return '';var k=Object.keys(rows[0]);
  return '﻿'+[k].concat(rows.map(function(r){return k.map(function(c){return r[c]})})).map(function(r){return r.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'}).join(';')}).join('\r\n')}
async function exportXlsx(sheets,file){
  try{await loadScript(CDN.xlsx);var wb=XLSX.utils.book_new();sheets.forEach(function(s){XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(s.rows),s.name.slice(0,31))});XLSX.writeFile(wb,file)}
  catch(e){dl(file.replace(/\.xlsx$/,'.csv'),new Blob([csvOf(sheets[0].rows)],{type:'text/csv;charset=utf-8'}));toast('warning','Excel no disponible sin conexión','Se descargó un CSV equivalente (compatible con Excel).')}
}
function diffOf(i){return finalQty(i)-i.stockTeorico}
function clsOf(d){return d===0?'Exacto':d<0?'Faltante':'Sobrante'}
function detailRows(inv,onlyDiff){return inv.items.map(function(i){var d=diffOf(i);return {SKU:i.sku,'Código de barras':i.barcode,Producto:i.descripcion,'Categoría/Marca':i.categoriaMarca,Ubicación:i.ubicacion,'Stock Teórico':i.stockTeorico,'Conteo 1':i.conteo1??'-','Conteo 2':i.conteo2??'-','Última corrección':i.conteoCorreccion??'-','Cantidad Final':finalQty(i),Diferencia:d,Clasificación:clsOf(d),'Fecha/Hora':finalCountTime(i),Contador:i.usuarioCorreccion||i.usuarioConteo2||i.usuarioConteo1||'-',Notas:i.correccionMotivo||i.notas||'-'}}).filter(function(r){return !onlyDiff||r.Diferencia!==0})}
function exportInvXlsx(inv,onlyDiff){return exportXlsx([{name:onlyDiff?'Diferencias':'Detalle_Conteo',rows:detailRows(inv,onlyDiff)}],(onlyDiff?'Diferencias_':'Detalle_')+inv.idInventario+'.xlsx')}
async function exportInvPdf(inv){
  try{await loadScript(CDN.jspdf);await loadScript(CDN.autotable)}catch(e){throw e}
  var doc=new window.jspdf.jsPDF({orientation:'landscape'});
  doc.setFontSize(15);doc.setTextColor(15,76,129);doc.text('Acta de Liquidación de Inventario - '+inv.companyName,14,14);
  doc.setFontSize(9);doc.setTextColor(51,65,85);
  doc.text('NIT: '+S.company.nit+'   |   ID: '+inv.idInventario+'   |   '+inv.titulo,14,21);
  doc.text('Responsable: '+inv.responsable+'   |   Auditor: '+inv.auditor+'   |   Exactitud: '+inv.indicadorExactitud+'%   |   Duración: '+inv.duracionMinutos+' min   |   Estado: '+inv.estado,14,26);
  doc.text('Inicio: '+(inv.fechaHoraInicio||'-')+'   |   Fin: '+(inv.fechaHoraFin||'-'),14,31);
  doc.autoTable({startY:36,head:[['SKU','Descripción','Ubicación','Teórico','Conteo 1','2do Conteo','Corrección','Final','Dif.','Fecha/Hora']],
    body:inv.items.map(function(i){var d=diffOf(i);return [i.sku,i.descripcion,i.ubicacion||'-',i.stockTeorico,i.conteo1??'-',i.conteo2??'-',i.conteoCorreccion??'-',finalQty(i),d>0?'+'+d:d,finalCountTime(i)]}),
    styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[15,76,129]},columnStyles:{3:{halign:'right'},4:{halign:'right'},5:{halign:'right'},6:{halign:'right'},7:{halign:'right'},8:{halign:'right'}}});
  var v=inv.items.filter(function(i){return diffOf(i)!==0}).map(function(i){var d=diffOf(i);return [i.sku,i.descripcion,i.stockTeorico,finalQty(i),d>0?'+'+d:d,d<0?'Faltante':'Sobrante',i.correccionMotivo||i.notas||'-']});
  var y=(doc.lastAutoTable&&doc.lastAutoTable.finalY||36)+10;doc.setFontSize(11);doc.setTextColor(15,76,129);doc.text('Resumen auditado de variaciones (faltantes y sobrantes)',14,y);
  doc.autoTable({startY:y+4,head:[['SKU','Descripción','Teórico','Final','Diferencia','Clasificación','Notas']],body:v.length?v:[['-','Sin variaciones (100% exactitud)','0','0','0','Exacto','-']],
    styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[230,81,0]}});
  var py=doc.lastAutoTable.finalY+22;doc.setFontSize(9);doc.setTextColor(0);
  doc.line(20,py,90,py);doc.line(120,py,190,py);doc.text('Responsable: '+inv.responsable,20,py+5);doc.text('Auditor: '+inv.auditor,120,py+5);
  doc.save('Liquidacion_'+inv.idInventario+'.pdf');
}
function downloadTemplate(){
  dl('Plantilla_Inventario.csv',new Blob(['﻿SKU;Codigo de Barras;Descripcion;Categoria;Ubicacion;Stock Teorico\r\nAGU-001;7701234567890;Aguardiente Tradicional 750ml;Aguardientes;Bodega A-01;48\r\nRON-002;7709876543210;Ron Añejo 700ml;Rones;Bodega A-02;30\r\nWHI-003;5000299225004;Whisky 12 años 750ml;Whisky;Vitrina 1;12\r\n'],{type:'text/csv;charset=utf-8'}));
}

/* ===================== SINCRONIZACIÓN (Google Apps Script) ===================== */
function itemTs(i){return [i.datetimeConteo2,i.datetimeConteo1].filter(Boolean).sort().pop()||''}
function mergeInv(a,b){
  var fin=a.estado==='FINALIZADO'?a:(b.estado==='FINALIZADO'?b:null);
  var head=fin||((a.updatedAt||'')>=(b.updatedAt||'')?a:b),oth=head===a?b:a,m=new Map();
  oth.items.forEach(function(i){m.set(i.idDetalle,i)});
  head.items.forEach(function(i){var o=m.get(i.idDetalle);m.set(i.idDetalle,o&&itemTs(o)>itemTs(i)&&!fin?o:i)});
  var r=Object.assign({},head);r.items=Array.from(m.values());r.indicadorExactitud=accuracy(r.items);
  r.reconteoHabilitado=a.reconteoHabilitado||b.reconteoHabilitado;r.deleted=head.deleted;return r;
}
function mergeState(rm){
  if(rm.company&&rm.company.name)S.company=Object.assign({},S.company,rm.company);
  var im=new Map(S.inventories.map(function(i){return [i.idInventario,i]}));
  (rm.inventories||[]).forEach(function(r){var l=im.get(r.idInventario);im.set(r.idInventario,keepOrder(l?mergeInv(r,l):r,l))});
  S.inventories=Array.from(im.values());
  var tm=new Map(S.traceability.map(function(t){return [t.idTrazabilidad,t]}));(rm.traceability||[]).forEach(function(t){if(!tm.has(t.idTrazabilidad))tm.set(t.idTrazabilidad,t)});
  S.traceability=Array.from(tm.values()).filter(function(t){var inv=S.inventories.find(function(i){return i.idInventario===t.idInventario});return inv&&!inv.deleted}).sort(function(a,b){return a.fechaRegistro<b.fechaRegistro?1:-1});
}
async function gas(action,extra,noAuth){
  var I=S.integration;if(!I.url)throw new Error('No hay un servidor configurado. Contacte al administrador del sistema.');
  var body=Object.assign({action:action},extra||{});if(!noAuth&&session)body.t=session.token;
  var r,t,tm,res;
  try{
    var fp=fetch(I.url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)}).then(function(x){return x.text().then(function(tx){return {r:x,t:tx}})});
    var to=new Promise(function(_,rej){tm=setTimeout(function(){rej(new Error('__TIMEOUT__'))},45000)});
    res=await Promise.race([fp,to]);r=res.r;t=res.t.trim();
  }catch(e){clearTimeout(tm);if(e&&e.message==='__TIMEOUT__')throw new Error('El servidor tardó demasiado en responder. Intente de nuevo en unos segundos.');
    throw new Error('No se pudo contactar con el servidor. Verifique su conexión a internet e intente de nuevo.')}
  clearTimeout(tm);
  if(t.charAt(0)==='<')throw new Error('El servicio no está disponible en este momento. Intente de nuevo o contacte al administrador.');
  var j;try{j=JSON.parse(t)}catch(e){throw new Error('El servidor devolvió una respuesta no válida. Intente de nuevo.')}
  if(j.ok===false){
    if(j.code==='AUTH'&&session){forceLogout('Su sesión expiró o fue revocada. Inicie sesión nuevamente.')}
    if(j.code==='BUSY'){var be=new Error(j.error||'El servidor está ocupado.');be.busy=true;throw be}
    var msg=j.error||'Error en el servidor';if(/no soportada|Token inv[aá]lido/i.test(msg))msg='El servidor está desactualizado. Contacte al administrador del sistema.';
    throw new Error(msg)}
  return j;
}
var syncP=null,syncAgain=false;
function syncNow(silent){
  if(spRestoring)return Promise.resolve();
  if(syncP){if(silent){syncAgain=true;return syncP}return syncP.then(function(){return syncNow(false)})}
  if(!S.integration.url||!session)return Promise.resolve();
  var done=function(){syncP=null;if(syncAgain){syncAgain=false;return syncNow(true)}};
  syncP=syncCore(silent).then(done,done);return syncP;
}
var SB0='1970-01-01T00:00:00Z',sbc=null,sbUrlUsed='',sbCh=null,sbLive=false,sbFirst=true,sbSent={},sbEst={},sbTs=SB0,sbRt=null,sbOrph=[];
function isSb(){return S.integration.backend==='supabase'}
function sbSaveLogin(){var b=$('#lbk');if(!b)return;var I=S.integration;I.backend=b.value;I.sbUrl=($('#lsu').value||'').trim().replace(/\/+$/,'');I.sbKey=($('#lsk').value||'').trim();if(!I.url)I.url=I.sbUrl||'x';save({noSync:true})}
async function sbEnsure(){
  var I=S.integration;if(!I.sbUrl||!I.sbKey)throw new Error('Falta la URL o la clave pública de Supabase («Conexión con el servidor»).');
  if(!sbc||sbUrlUsed!==I.sbUrl){await loadScript(SP_SDK_ASSET,SP_SDK_WAIT);if(!sbc||sbUrlUsed!==I.sbUrl){sbc=window.supabase.createClient(I.sbUrl,I.sbKey,{global:{fetch:spFetch},auth:{persistSession:true,autoRefreshToken:true},realtime:{params:{eventsPerSecond:20}}});sbUrlUsed=I.sbUrl;sbCh=null}}
  if(!sbCh&&session&&!spRestoring){sbCh=sbc.channel('sp-kv').on('postgres_changes',{event:'*',schema:'public',table:'kv'},function(p){if(p.new&&p.new.id)sbHandle([p.new])}).subscribe(function(st){sbLive=(st==='SUBSCRIBED');if(sbLive&&!sbFirst)syncNow(true)})}
}
function sbStop(){try{if(sbc){sbc.removeAllChannels();sbc.auth.signOut()}}catch(e){}sbCh=null;sbLive=false;sbFirst=true;sbSent={};sbEst={};sbTs=SB0;sbOrph=[]}
async function sbUsers(current){
 try{var r=await spReadQuery(sbc.from('profiles').select('*'));if((!current||session===current)&&!r.error&&r.data)S.users=r.data.map(function(p){return {id:p.id,username:p.username,name:p.name,email:'',role:p.role,cargo:p.cargo||'',active:p.active!==false}})}catch(e){}
}
async function sbLogin(user,pass){
  await sbEnsure();var em=String(user||'').trim().toLowerCase();if(em.indexOf('@')<0)em+='@stockpulse.app';
  var r=await sbc.auth.signInWithPassword({email:em,password:pass||''});if(r.error)throw new Error('Usuario o contraseña incorrectos.');
  var p=await sbc.from('profiles').select('*').eq('id',r.data.user.id).single();
  if(p.error||!p.data||p.data.active===false){await sbc.auth.signOut();throw new Error('Su usuario no tiene acceso. Contacte al administrador.')}
  session={id:p.data.id,username:p.data.username,name:p.data.name,role:p.data.role,cargo:p.data.cargo||'',active:true,token:'sb'};
  sbFirst=true;sbSent={};sbEst={};sbTs=SB0;sbOrph=[];await sbUsers();saveSess();audit('login','');save({noSync:true});return session;
}
function sbData(col,o,p){
  if(col==='entry')return {idDetalle:p.idDetalle,qty:o.qty,ubicacion:o.ubicacion,usuario:o.usuario,fecha:o.fecha,deleted:!!o.deleted};
  var d=Object.assign({},o);if(col==='inv')delete d.items;
  else if(col==='item'){delete d.entradas;if(o.entradas&&o.entradas.length){delete d.conteo1;delete d.datetimeConteo1;delete d.usuarioConteo1}}
  return d;
}
function sbApply(r){
  var d=r.data,k=r.col+':'+r.id,inv,it;
  if(r.col==='trace'){if(!S.traceability.some(function(t){return t.idTrazabilidad===r.id}))S.traceability.unshift(d);return 1}
  if(r.col==='inv'){inv=S.inventories.find(function(i){return i.idInventario===r.id});sbEst[r.id]=d.estado;
    if(inv&&inv.estado==='FINALIZADO'&&d.estado!=='FINALIZADO')return 1;
    if(!inv){inv=Object.assign({},d,{items:[]});S.inventories.unshift(inv)}else{var its=inv.items;Object.assign(inv,d);inv.items=its}
    sbSent[k]=JSON.stringify(sbData('inv',inv));return 1}
  inv=S.inventories.find(function(i){return i.idInventario===r.inv});if(!inv)return 0;
  if(r.col==='item'){it=inv.items.find(function(x){return x.idDetalle===r.id});
    if(!it){it=Object.assign({entradas:[],conteo1:null,datetimeConteo1:null,usuarioConteo1:null},d);inv.items.push(it)}else Object.assign(it,d);
    sbSent[k]=JSON.stringify(sbData('item',it));return 1}
  if(r.col==='entry'){it=inv.items.find(function(x){return x.idDetalle===d.idDetalle});if(!it)return 0;it.entradas=it.entradas||[];
    var e=it.entradas.find(function(x){return x.id===r.id}),n={id:r.id,qty:d.qty,ubicacion:d.ubicacion,usuario:d.usuario,fecha:d.fecha,deleted:!!d.deleted};
    if(e)Object.assign(e,n);else{e=n;it.entradas.push(e)}
    recalc(inv,it);sbSent[k]=JSON.stringify(sbData('entry',e,it));return 1}
  return 1;
}
function sbHandle(rows){
  rows=sbOrph.concat(rows);sbOrph=[];var orph=[];
  rows.forEach(function(r){if(r.ts&&r.ts>sbTs)sbTs=r.ts;if(!sbApply(r))orph.push(r)});
  orph.forEach(function(r){if(!sbApply(r))sbOrph.push(r)});
  if(!spRestoring){clearTimeout(sbRt);sbRt=setTimeout(function(){save({noSync:true});refreshLive()},120)}
}
async function sbPull(all,onPage){
  var cols=all?['inv','item','entry','trace']:[null];
  var pageSize=onPage?400:1000;
  for(var c=0;c<cols.length;c++){var since=all?SB0:new Date(Date.parse(sbTs)-5000).toISOString(),from=0,n;
    do{var q=sbc.from('kv').select('*').gt('ts',since).order('ts',{ascending:true}).order('id',{ascending:true}).order('col',{ascending:true}).range(from,from+pageSize-1);if(cols[c])q=q.eq('col',cols[c]);
      var r=await spReadQuery(q);if(r.error){if(r.status===0)throw spReadTimeout();throw r.error}
      sbHandle(r.data);n=r.data.length;from+=n;if(onPage)onPage(n)
    }while(n===pageSize)}
}
async function sbPush(){
  if(session.role==='CONSULTOR')return;var adm=session.role!=='OPERARIO',rows=[];
  S.inventories.forEach(function(inv){var id=inv.idInventario;
    if(adm||(inv.estado==='EN_CURSO'&&sbEst[id]==='PENDIENTE'))rows.push({col:'inv',id:id,inv:id,data:sbData('inv',inv)});
    inv.items.forEach(function(it){rows.push({col:'item',id:it.idDetalle,inv:id,data:sbData('item',it)});
      (it.entradas||[]).forEach(function(e){rows.push({col:'entry',id:e.id,inv:id,data:sbData('entry',e,it)})})})});
  if(adm)S.traceability.forEach(function(t){rows.push({col:'trace',id:t.idTrazabilidad,inv:t.idInventario,data:t})});
  var ch=[];rows.forEach(function(r){r.s=JSON.stringify(r.data);if(sbSent[r.col+':'+r.id]!==r.s)ch.push(r)});
  for(var i=0;i<ch.length;i+=200){var part=ch.slice(i,i+200);
    var rr=await sbc.from('kv').upsert(part.map(function(r){return {col:r.col,id:r.id,inv:r.inv,data:r.data}}),{onConflict:'col,id'});
    if(rr.error&&!/row-level security|42501/i.test((rr.error.message||'')+(rr.error.code||'')))throw new Error(rr.error.message);
    part.forEach(function(r){sbSent[r.col+':'+r.id]=r.s})}
}
async function sbSync(silent,pullOnly){
  var I=S.integration,previous=I.lastSyncStatus;
  try{await sbEnsure();if(sbFirst){await sbPull(true);sbFirst=false}if(!pullOnly)await sbPush();await sbPull(false);
    I.lastSyncAt=now();I.lastSyncStatus='ok';I.lastSyncMessage='Supabase · '+(sbLive?'tiempo real activo':'actualización periódica');save({noSync:true});if(!silent)toast('success','Sincronización completa',I.lastSyncMessage)}
  catch(e){if(!pullOnly&&!spNetworkError(e)&&/JWT|not authenticated|401/i.test(e.message||'')&&session){forceLogout('Su sesión expiró. Inicie sesión nuevamente.');return false}
    I.lastSyncAt=now();I.lastSyncStatus='error';I.lastSyncMessage=spDataError(e);save({noSync:true});
    if(!pullOnly){if(!silent||previous!=='error')toast('error','Falló la sincronización',I.lastSyncMessage);refreshLive()}return false}
  return true;
}
/* conteos por registros: varios usuarios/ubicaciones suman sobre el mismo código */
function recalc(inv,it){var E=it.entradas||[];if(!E.length)return;var A=E.filter(function(e){return !e.deleted});
  if(!A.length){it.conteo1=null;it.datetimeConteo1=null;it.usuarioConteo1=null;return}
  it.conteo1=A.reduce(function(a,e){return a+e.qty},0);it.datetimeConteo1=A.map(function(e){return e.fecha}).sort().pop();
  var u=[];A.forEach(function(e){if(e.usuario&&u.indexOf(e.usuario)<0)u.push(e.usuario)});it.usuarioConteo1=u.join(', ')}
function entryCtx(id,itemId){need('count');var inv=byId(id);if(!inv)throw new Error('Inventario no encontrado.');
  if(inv.estado==='FINALIZADO')throw new Error('El inventario ya fue finalizado.');
  var it=inv.items.find(function(x){return x.idDetalle===itemId});if(!it)throw new Error('Artículo no encontrado.');
  if(!it.entradas){it.entradas=[];if(it.conteo1!=null)it.entradas.push({id:'en-m-'+it.idDetalle,qty:it.conteo1,ubicacion:'General',usuario:it.usuarioConteo1||'',fecha:it.datetimeConteo1||now(),deleted:false})}
  return {inv:inv,it:it}}
function entryDone(c){var inv=c.inv,it=c.it;if(inv.reconteoHabilitado&&it.conteo2==null)it.requiereReconteo=it.conteo1!==it.stockTeorico;
  inv.indicadorExactitud=accuracy(inv.items);touch(inv);save();return it}
function addEntry(id,itemId,qty,ubic,notes){var c=entryCtx(id,itemId);qty=Number(qty);
  if(!isFinite(qty)||qty<0||Math.round(qty)!==qty)throw new Error('Ingrese una cantidad entera mayor o igual a 0.');
  var t=now();c.it.entradas.push({id:uid('en-'),qty:qty,ubicacion:clean(ubic)||'General',usuario:session.name,fecha:t,deleted:false});
  if(notes!=null)c.it.notas=clean(notes);if(c.inv.estado==='PENDIENTE'){c.inv.estado='EN_CURSO';c.inv.fechaHoraInicio=t}
  recalc(c.inv,c.it);return entryDone(c)}
function ownEntry(c,eid){var e=c.it.entradas.find(function(x){return x.id===eid});if(!e)throw new Error('Registro no encontrado.');
  if(e.usuario!==session.name&&!can('finalize'))throw new Error('Solo puede modificar sus propios registros.');return e}
function editEntry(id,itemId,eid,qty){var c=entryCtx(id,itemId),e=ownEntry(c,eid);qty=Number(qty);
  if(!isFinite(qty)||qty<0||Math.round(qty)!==qty)throw new Error('Ingrese una cantidad entera mayor o igual a 0.');
  e.qty=qty;e.fecha=now();recalc(c.inv,c.it);return entryDone(c)}
function delEntry(id,itemId,eid){var c=entryCtx(id,itemId),e=ownEntry(c,eid);e.deleted=true;e.fecha=now();recalc(c.inv,c.it);return entryDone(c)}
function openEntryModal(itemId){
  var inv=byId(ui.invId),it=inv&&inv.items.find(function(x){return x.idDetalle===itemId});if(!it)return;
  var A=(it.entradas||[]).filter(function(e){return !e.deleted}),tot=A.reduce(function(a,e){return a+e.qty},0);
  if(!A.length&&it.conteo1!=null&&!(it.entradas&&it.entradas.length))A=[{id:'en-m-'+it.idDetalle,qty:it.conteo1,ubicacion:'General',usuario:it.usuarioConteo1||'',fecha:it.datetimeConteo1||''}],tot=it.conteo1;
  openModal('<h2>Registrar conteo</h2><div style="margin:10px 0"><b>'+esc(it.descripcion)+'</b><div class="small muted mono">'+esc(it.sku)+' '+esc(it.barcode)+'</div>'+(showTheo(inv)?'<div>Stock teórico: <b>'+it.stockTeorico+'</b></div>':'')+'</div>'+
   (A.length?'<div class="err" style="background:#fffbeb;border-color:#fde68a;color:#92400e;margin-bottom:10px">Ya hay un conteo de <b>'+tot+'</b> unidades en este artículo. Si cuenta otra ubicación, ingrese solo las unidades que faltan: se sumarán al total.<div style="margin-top:6px">'+
     A.map(function(e){var mine=(e.usuario===session.name||can('finalize'))&&inv.estado!=='FINALIZADO';return '<div class="row sp" style="gap:6px"><span class="small">'+e.qty+' · '+esc(e.ubicacion)+' · '+esc(e.usuario)+' · '+esc((e.fecha||'').slice(11,16))+'</span>'+(mine?'<span><button type="button" class="btn s" data-act="entEdit" data-e="'+esc(e.id)+'" data-q="'+e.qty+'">✎</button> <button type="button" class="btn s d" data-act="entDel" data-e="'+esc(e.id)+'">✕</button></span>':'')+'</div>'}).join('')+'</div></div>':'')+
   '<form id="entryForm" data-item="'+esc(itemId)+'" class="col"><div class="grid g2"><div><label id="en_l">'+(A.length?'Unidades a agregar':'Cantidad contada')+'</label><input id="en_q" type="number" inputmode="numeric" min="0" step="1" required style="font-size:22px;font-weight:800"></div>'+
   '<div><label>Ubicación</label><input id="en_u" list="en_ul" maxlength="40" value="'+esc(ui.lastUbic||'Exhibición')+'"><datalist id="en_ul"><option value="Exhibición"><option value="Bodega principal"><option value="Bodega secundaria"></datalist></div></div>'+
   '<div><label>Observaciones (opcional)</label><input id="en_n" maxlength="200" value="'+esc(it.notas||'')+'"></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn p" id="en_b">'+(A.length?'Agregar y guardar':'Guardar')+'</button></div></form>');
  setTimeout(function(){var e=$('#en_q');if(e)e.focus()},60);
}
var pushed={},srvRev=null,busyN=0;
function keepOrder(mg,l){if(!l||!mg.items)return mg;var pos={},big=l.items.length;l.items.forEach(function(x,k){pos[x.idDetalle]=k});
  mg.items=mg.items.map(function(x,k){return {x:x,o:pos[x.idDetalle]!==undefined?pos[x.idDetalle]:big+k}}).sort(function(a,b){return a.o-b.o}).map(function(w){return w.x});return mg}
function pendingInv(){if(!session||session.role==='CONSULTOR')return [];return S.inventories.filter(function(i){return pushed[i.idInventario]!==i.updatedAt})}
async function syncCore(silent){if(isSb())return sbSync(silent);
  var I=S.integration;
  try{
    var pend=pendingInv(),sent={},ids={},payload=null;
    pend.forEach(function(i){sent[i.idInventario]=i.updatedAt;ids[i.idInventario]=1});
    if(pend.length)payload={company:S.company,inventories:pend,traceability:S.traceability.filter(function(t){return ids[t.idInventario]})};
    var res=await gas('sync',{state:payload,since:srvRev});
    if(res.state){
      var before={};S.inventories.forEach(function(i){before[i.idInventario]=i.updatedAt});
      mergeState(res.state);
      S.inventories.forEach(function(i){var id=i.idInventario,b=before[id];if(b===undefined||b===sent[id]||pushed[id]===b)pushed[id]=i.updatedAt});
    }
    if(res.rev!=null)srvRev=res.rev;
    if(res.users){S.users=res.users;var me=S.users.find(function(u){return u.id===session.id});
      if(!me||me.active===false){save({noSync:true});forceLogout('Su usuario ya no tiene acceso.');return}
      if(me.role!==session.role){session.role=me.role;saveSess()}}
    busyN=0;
    I.lastSyncAt=now();I.lastSyncStatus='ok';I.lastSyncMessage='Sincronizado ('+vis().length+' inventarios)';if(res.spreadsheetUrl)I.spreadsheetUrl=res.spreadsheetUrl;
    save({noSync:true});if(!silent)toast('success','Sincronización completa',I.lastSyncMessage);if(res.state)refreshLive();
  }catch(e){
    if(e&&e.busy&&busyN<5){busyN++;setTimeout(function(){syncNow(true)},2000+Math.floor(Math.random()*3000));return}
    busyN=0;I.lastSyncAt=now();I.lastSyncStatus='error';I.lastSyncMessage=e.message;save({noSync:true});if(!silent)toast('error','Falló la sincronización',e.message)}
}
setInterval(function(){if(session&&S.integration.auto&&S.integration.url&&!document.hidden)syncNow(true)},15000);
window.addEventListener('online',function(){if(session&&S.integration.url)syncNow(true)});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&session&&S.integration.auto&&S.integration.url)syncNow(true)});

/* ===================== UI: utilidades ===================== */
function toast(type,title,desc){var el=document.createElement('div');el.className='toast '+type;el.innerHTML='<b>'+esc(title)+'</b>'+(desc?'<span>'+esc(desc)+'</span>':'');$('#toasts').appendChild(el);setTimeout(function(){el.remove()},4500)}
function openModal(html,wide){$('#modal').innerHTML='<div class="ov" data-act="ovClick"><div class="box'+(wide?' wide':'')+'">'+html+'</div></div>'}
function closeModal(){stopScanner();$('#modal').innerHTML=''}
function badge(e){return '<span class="badge b-'+e+'">'+({PENDIENTE:'Pendiente',EN_CURSO:'En curso',FINALIZADO:'Finalizado'}[e]||e)+'</span>'}
function bar(p){return '<div class="bar"><i style="width:'+Math.max(0,Math.min(100,p))+'%"></i></div>'}
function progress(inv){var c=inv.items.filter(function(i){return i.conteo1!==null}).length;return {c:c,t:inv.items.length,p:inv.items.length?c/inv.items.length*100:0}}
function icon(n){return {box:'▦',scan:'⌁'}[n]||''}

/* ===================== LOGIN ===================== */
function vLogin(err){
  return '<div class="login"><div class="box"><div class="hero"><div style="font-size:12px;opacity:.8;font-weight:700;letter-spacing:.06em">STOCKPULSE · TOMA FÍSICA DE INVENTARIOS</div>'+
  '<h1 style="margin-top:6px">'+esc(S.company.name)+'</h1><div style="opacity:.8;font-size:12px;margin-top:2px">NIT '+esc(S.company.nit)+'</div></div>'+
  '<form id="loginForm" autocomplete="on">'+(err?'<div class="err">'+esc(err)+'</div>':'')+
  '<div><label for="lu">Usuario o correo</label><input id="lu" name="username" autocomplete="username" autocapitalize="none" required autofocus></div>'+
  '<div><label for="lp">Contraseña</label><div class="row" style="flex-wrap:nowrap"><input id="lp" name="password" type="password" autocomplete="current-password" required>'+
  '<button type="button" class="btn" data-act="togglePw" title="Mostrar/ocultar">👁</button></div></div>'+
  '<button class="btn p" type="submit" style="justify-content:center">Iniciar sesión</button>'+
  '<details '+(S.integration.url?'':'open')+'><summary class="small muted" style="cursor:pointer">Conexión con el servidor</summary><div style="margin-top:8px"><select id="lbk" style="margin-bottom:8px"><option value="gas"'+(S.integration.backend==='supabase'?'':' selected')+'>Google Sheets (Apps Script)</option><option value="supabase"'+(S.integration.backend==='supabase'?' selected':'')+'>Supabase (tiempo real)</option></select><input id="lsu" value="'+esc(S.integration.sbUrl||'')+'" placeholder="URL de Supabase (solo modo Supabase)" autocomplete="off" style="margin-bottom:8px"><input id="lsk" value="'+esc(S.integration.sbKey||'')+'" placeholder="Clave pública anon (solo modo Supabase)" autocomplete="off" style="margin-bottom:8px"><input id="lsrv" value="'+esc(S.integration.url)+'" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"><div class="row" style="margin-top:8px"><button type="button" class="btn s" data-act="loginPing">🔌 Probar conexión</button></div><div id="lstatus" class="small" style="margin-top:6px"></div></div></details>'+
  '<div class="small muted center">Acceso restringido a personal autorizado de '+esc(S.company.name)+'.</div></form></div></div>';
}

/* ===================== SHELL ===================== */
function navItems(){return [['dashboard','Inicio','🏠',true],['create','Crear','➕',can('createInv')],['inventories','Inventarios','📦',true],['reports','Reportes','📊',can('reports')],['users','Usuarios','👥',can('users')],['settings','Ajustes','⚙️',can('settings')]].filter(function(x){return x[3]})}
function vShell(inner){
  var cur=(ui.view==='count'||ui.view==='recount')?'inventories':ui.view,nv=navItems();
  var I=S.integration,same=I.lastSyncStatus,sync=I.url?'<span class="badge '+(same==='error'?'b-er':same==='ok'?'b-ok':'b-in')+'" title="'+esc(I.lastSyncMessage||'Esperando la sincronización')+'">'+(I.backend==='supabase'?'Supabase'+(sbLive?' ⚡':''):'Sheets')+' '+(same==='error'?'⚠':same==='ok'?'✔':'…')+'</span>':'';
  return '<header class="top"><div class="brand" data-act="nav" data-v="dashboard"><span style="font-size:20px">📦</span><div>StockPulse<small>'+esc(S.company.name)+'</small></div></div>'+
   '<nav class="tabs">'+nv.map(function(n){return '<button class="'+(cur===n[0]?'on':'')+'" data-act="nav" data-v="'+n[0]+'">'+n[1]+'</button>'}).join('')+'</nav>'+
   '<div class="userchip">'+sync+'<div class="who"><b>'+esc(session.name)+'</b><span style="opacity:.75">'+esc(ROLES[session.role])+'</span></div>'+
   '<button class="btn ghost s" data-act="pwModal" title="Cambiar contraseña">🔑</button><button class="btn ghost s" data-act="logout">Salir</button></div></header>'+
   '<main id="main">'+inner+'</main>'+
   '<div class="bottomnav">'+nv.map(function(n){return '<button class="'+(cur===n[0]?'on':'')+'" data-act="nav" data-v="'+n[0]+'"><div style="font-size:18px">'+n[2]+'</div>'+n[1]+'</button>'}).join('')+'</div>';
}

/* ===================== DASHBOARD ===================== */
function vDashboard(){
  var L=vis(),fin=L.filter(function(i){return i.estado==='FINALIZADO'}),act=L.filter(function(i){return i.estado==='EN_CURSO'}),pen=L.filter(function(i){return i.estado==='PENDIENTE'});
  var acc=fin.length?(fin.reduce(function(a,i){return a+i.indicadorExactitud},0)/fin.length).toFixed(1)+'%':'—';
  var counted=L.reduce(function(a,i){return a+i.items.filter(function(x){return x.conteo1!==null}).length},0);
  var h='<div class="row sp" style="margin-bottom:16px"><div><h1>Hola, '+esc(session.name.split(' ')[0])+'</h1><div class="muted">'+esc(S.company.name)+' · '+esc(S.company.sedePrincipal||'')+'</div></div>'+
   (can('createInv')?'<button class="btn p" data-act="nav" data-v="create">➕ Crear inventario</button>':'')+'</div>'+
   '<div class="grid g4" style="margin-bottom:16px">'+
   kpi(L.length,'Inventarios creados')+kpi(act.length,'En curso')+kpi(pen.length,'Pendientes de iniciar')+kpi(acc,'Exactitud global (finalizados)')+'</div>'+
   '<div class="grid g2"><div class="card"><div class="row sp" style="margin-bottom:10px"><h2>Conteos activos</h2><span class="muted small">'+fmtN(counted)+' ítems contados</span></div>';
  var work=act.concat(pen);
  h+=work.length?work.map(function(i){var p=progress(i);return '<div class="item" style="margin-bottom:8px"><div style="flex:1;min-width:0"><b>'+esc(i.idInventario)+'</b> '+badge(i.estado)+'<div class="small muted">'+esc(i.titulo)+'</div><div style="margin-top:6px">'+bar(p.p)+'</div><div class="small muted">'+p.c+' / '+p.t+' contados</div></div>'+
     (can('count')?'<button class="btn p s" data-act="openCount" data-id="'+esc(i.idInventario)+'">'+(i.estado==='PENDIENTE'?'Iniciar':'Continuar')+'</button>':'')+'</div>'}).join(''):'<div class="muted center" style="padding:24px">No hay inventarios activos.</div>';
  h+='</div><div class="card"><h2 style="margin-bottom:10px">Últimos finalizados</h2>';
  h+=fin.length?'<table><thead><tr><th>ID</th><th>Título</th><th class="right">Exactitud</th></tr></thead><tbody>'+fin.slice(0,6).map(function(i){return '<tr><td class="mono">'+esc(i.idInventario)+'</td><td>'+esc(i.titulo)+'</td><td class="right"><b>'+i.indicadorExactitud+'%</b></td></tr>'}).join('')+'</tbody></table>':'<div class="muted center" style="padding:24px">Aún no hay inventarios finalizados.</div>';
  h+='</div></div>';
  if(!can('count')&&!can('createInv'))h+='<div class="card" style="margin-top:14px">Su perfil es de <b>consulta</b>: puede ver inventarios, reportes, trazabilidad y exportar a Excel.</div>';
  return h;
}
function kpi(n,l){return '<div class="card kpi"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'}

/* ===================== CREAR INVENTARIO ===================== */
function spAssigneeOptions(auditor){
  var users=S.users.filter(function(u){return !u.deleted&&u.active!==false});
  if(!users.length&&session)users=[session];
  if(auditor)users=users.filter(function(u){return u.role==='SUPERVISOR'||u.role==='ADMIN'});
  return users.map(function(u){return '<option '+(u.id===session.id?'selected':'')+'>'+esc(u.name)+'</option>'}).join('');
}
function vCreate(){
  return '<div class="row sp" style="margin-bottom:14px"><div><h1>Crear inventario</h1><div class="muted">Cargue el catálogo teórico desde Excel, CSV o PDF, o agregue artículos manualmente.</div></div></div>'+
  '<div class="grid g2"><div class="card col"><h2>1. Datos generales</h2>'+
  '<div><label>Título</label><input id="c_titulo" placeholder="Toma física '+esc(S.company.name)+'"></div>'+
  '<div class="grid g2"><div><label>Responsable</label><select id="c_resp">'+spAssigneeOptions(false)+'</select></div>'+
  '<div><label>Auditor</label><select id="c_aud">'+spAssigneeOptions(true)+'</select></div></div>'+
  '<label class="row" style="font-weight:600"><input type="checkbox" id="c_theo"> Mostrar stock teórico durante el conteo (desmarcado = conteo ciego)</label>'+
  '<div class="small muted">Los operarios siempre cuentan en modo ciego, aunque se muestre el teórico a supervisores.</div></div>'+
  '<div class="card col"><h2>2. Catálogo de artículos</h2><div class="drop" id="drop"><div style="font-size:26px">📄</div><b>Arrastre un archivo o haga clic</b><div class="small muted">.xlsx · .xls · .csv · .pdf (máx. 15 MB)</div><input type="file" id="c_file" accept=".csv,.xls,.xlsx,.pdf"></div>'+
  '<div class="row"><button class="btn s" data-act="template">⬇ Descargar plantilla CSV</button><button class="btn s" data-act="addRowModal">+ Artículo manual</button></div></div></div>'+
  '<div class="card" style="margin-top:14px" id="stage"></div>';
}
function renderStage(){
  var el=$('#stage');if(!el)return;var st=ui.stage;
  if(!st.rows.length){el.innerHTML='<div class="muted center" style="padding:20px">Aún no hay artículos cargados.</div>';return}
  var tot=st.rows.reduce(function(a,r){return a+r.stockTeorico},0);
  el.innerHTML='<div class="row sp"><div><h2>Vista previa '+(st.fileName?'· '+esc(st.fileName):'')+'</h2><div class="muted small">'+st.rows.length+' artículos · '+fmtN(tot)+' unidades teóricas</div></div>'+
   '<div class="row"><button class="btn s d" data-act="clearStage">Limpiar</button><button class="btn p" data-act="submitInv">✔ Crear inventario</button></div></div>'+
   st.warnings.map(function(w){return '<div class="err" style="background:#fffbeb;border-color:#fde68a;color:#92400e;margin-top:8px">⚠ '+esc(w)+'</div>'}).join('')+
   '<div class="tw" style="margin-top:10px"><table><thead><tr><th>#</th><th>SKU</th><th>Código barras</th><th>Descripción</th><th>Categoría</th><th>Ubicación</th><th class="right">Stock</th><th></th></tr></thead><tbody>'+
   st.rows.slice(0,200).map(function(r,i){return '<tr><td>'+(i+1)+'</td><td class="mono">'+esc(r.sku)+'</td><td class="mono">'+esc(r.barcode)+'</td><td>'+esc(r.descripcion)+'</td><td>'+esc(r.categoriaMarca)+'</td><td>'+esc(r.ubicacion)+'</td><td class="right">'+r.stockTeorico+'</td><td><button class="btn s d" data-act="rmRow" data-i="'+i+'">✕</button></td></tr>'}).join('')+
   '</tbody></table></div>'+(st.rows.length>200?'<div class="small muted">Mostrando 200 de '+st.rows.length+' (todas se importarán).</div>':'');
}

/* ===================== INVENTARIOS ===================== */
function vInventories(){
  var tabs=[['ALL','Todos'],['EN_CURSO','En curso'],['PENDIENTE','Pendientes'],['FINALIZADO','Finalizados']];
  return '<div class="row sp" style="margin-bottom:14px"><div><h1>Inventarios</h1><div class="muted">Del conteo inicial a la liquidación auditada.</div></div>'+(can('createInv')?'<button class="btn p" data-act="nav" data-v="create">➕ Crear</button>':'')+'</div>'+
   '<div class="row sp" style="margin-bottom:12px"><div class="tabs2">'+tabs.map(function(t){return '<button class="'+(ui.tab===t[0]?'on':'')+'" data-act="tab" data-t="'+t[0]+'">'+t[1]+'</button>'}).join('')+'</div>'+
   '<input id="invq" style="max-width:260px" placeholder="Buscar ID o título…" value="'+esc(ui.q)+'"></div><div id="invlist" class="col">'+invListHTML()+'</div>';
}
function invListHTML(){
  var q=ui.q.toLowerCase(),L=vis().filter(function(i){return (ui.tab==='ALL'||i.estado===ui.tab)&&(!q||(i.idInventario+' '+i.titulo).toLowerCase().indexOf(q)>=0)});
  if(!L.length)return '<div class="card muted center" style="padding:30px">No hay inventarios con este filtro.</div>';
  return L.map(function(i){
    var p=progress(i),id=esc(i.idInventario),fin=i.estado==='FINALIZADO',nd=i.items.filter(function(x){return hasCount(x)&&finalQty(x)!==x.stockTeorico}).length;
    var b='<button class="btn s" data-act="detail" data-id="'+id+'">Ver detalle</button>';
    if(!fin&&can('count'))b='<button class="btn p s" data-act="openCount" data-id="'+id+'">'+(i.estado==='PENDIENTE'?'▶ Iniciar conteo':'Continuar conteo')+'</button>'+b;
    b+=recountAction(i,i.reconteoHabilitado?'btn s a':'btn s');
    if(openInventory(i)&&can('correctFinal'))b+='<button class="btn s" data-act="detail" data-id="'+id+'">Corregir cantidades</button>';
    if(!fin&&can('toggleTheo'))b+='<button class="btn s" data-act="toggleTheo" data-id="'+id+'">'+(i.mostrarStockTeorico?'🙈 Ocultar teórico':'👁 Mostrar teórico')+'</button>';
    if(!fin&&can('finalize'))b+='<button class="btn s p" data-act="finalizeAsk" data-id="'+id+'">Finalizar</button>';
    if(can('reports')||fin){b+='<button class="btn s" data-act="expX" data-id="'+id+'">Excel</button>'}
    if(fin||can('reports'))b+='<button class="btn s" data-act="expP" data-id="'+id+'">PDF</button>';
    if(i.estado==='PENDIENTE'&&can('deleteInv'))b+='<button class="btn s d" data-act="delInv" data-id="'+id+'">Eliminar</button>';
    return '<div class="card"><div class="row sp"><div style="min-width:0"><b class="mono">'+id+'</b> '+badge(i.estado)+' '+(i.reconteoHabilitado?'<span class="badge b-wa">2do conteo</span>':'')+(i.mostrarStockTeorico?'':' <span class="badge b-in">Ciego</span>')+
     '<div style="font-weight:600;margin-top:2px">'+esc(i.titulo)+'</div><div class="small muted">Resp.: '+esc(i.responsable)+' · Auditor: '+esc(i.auditor)+' · '+esc(i.fechaRealizacion)+'</div></div>'+
     '<div class="right"><div class="kpi"><span class="n" style="font-size:22px">'+i.indicadorExactitud+'%</span></div><div class="small muted">exactitud</div></div></div>'+
     '<div style="margin:10px 0 4px">'+bar(p.p)+'</div><div class="small muted">'+p.c+' / '+p.t+' artículos contados'+(nd?' · '+nd+' con diferencia':'')+(fin?' · '+i.duracionMinutos+' min':'')+'</div>'+
     '<div class="row" style="margin-top:10px">'+b+'</div></div>'}).join('');
}
function canCorrectItem(inv,it){return can('correctFinal')&&openInventory(inv)&&hasCount(it)&&!(inv.reconteoHabilitado&&it.requiereReconteo&&it.conteo2==null)}
function detailHTML(inv,f){
  var rows=inv.items.map(function(i){return {i:i,d:diffOf(i)}}).filter(function(r){return f==='all'||(f==='diff'&&r.d!==0&&hasCount(r.i))||(f==='short'&&r.d<0&&hasCount(r.i))||(f==='over'&&r.d>0)});
  var th=showTheo(inv)||session.role==='CONSULTOR'||inv.estado==='FINALIZADO'&&session.role!=='OPERARIO';
  var canCorrect=can('correctFinal')&&openInventory(inv);
  return '<div class="tw"><table><thead><tr><th>SKU</th><th>Descripción</th><th>Ubicación</th>'+(th?'<th class="right">Teórico</th>':'')+'<th class="right">Conteo 1</th><th class="right">Conteo 2</th><th class="right">Última corrección</th><th class="right">Cantidad final</th>'+(th?'<th class="right">Dif.</th>':'')+'<th>Hora</th>'+(canCorrect?'<th>Acción</th>':'')+'</tr></thead><tbody>'+
   (rows.length?rows.map(function(r){var i=r.i;return '<tr><td class="mono">'+esc(i.sku)+'</td><td>'+esc(i.descripcion)+(i.notas?'<div class="small muted">'+esc(i.notas)+'</div>':'')+'</td><td>'+esc(i.ubicacion)+'</td>'+(th?'<td class="right">'+i.stockTeorico+'</td>':'')+
    '<td class="right">'+(i.conteo1??'-')+'</td><td class="right">'+(i.conteo2??'-')+'</td><td class="right">'+(i.conteoCorreccion??'-')+'</td><td class="right"><b>'+(hasCount(i)?finalQty(i):'-')+'</b></td>'+(th?'<td class="right"><span class="badge '+(r.d===0?'b-ok':r.d<0?'b-er':'b-wa')+'">'+(r.d>0?'+':'')+r.d+'</span></td>':'')+'<td class="small muted">'+esc(finalCountTime(i))+'</td>'+
    (canCorrect?'<td>'+(canCorrectItem(inv,i)?'<button type="button" class="btn s" data-act="spCorrect" data-id="'+esc(inv.idInventario)+'" data-item="'+esc(i.idDetalle)+'" data-f="'+esc(f)+'">Corregir</button>':(inv.reconteoHabilitado&&i.requiereReconteo&&i.conteo2==null?'<span class="small muted">2do conteo pendiente</span>':'-'))+'</td>':'')+'</tr>'}).join(''):'<tr><td colspan="'+(8+(th?2:0)+(canCorrect?1:0))+'" class="center muted" style="padding:20px">Sin registros con este filtro.</td></tr>')+'</tbody></table></div>';
}
function openDetail(id,f){
  var inv=byId(id);if(!inv)return;f=f||'all';
  var fl=[['all','Todos'],['diff','Solo diferencias'],['short','Solo faltantes'],['over','Solo sobrantes']];
  openModal('<div class="row sp"><div><h2>'+esc(inv.idInventario)+' · '+esc(inv.titulo)+'</h2><div class="small muted">Exactitud '+inv.indicadorExactitud+'% · '+inv.items.length+' artículos</div></div><button class="btn s" data-act="closeModal">✕</button></div>'+
   '<div class="row sp" style="margin:12px 0"><div class="tabs2">'+fl.map(function(x){return '<button class="'+(f===x[0]?'on':'')+'" data-act="detailF" data-id="'+esc(id)+'" data-f="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</div>'+
   ((can('reports')||inv.estado==='FINALIZADO')?'<div class="row"><button class="btn s" data-act="expX" data-id="'+esc(id)+'">Excel detalle</button><button class="btn s" data-act="expXd" data-id="'+esc(id)+'">Excel diferencias</button><button class="btn s" data-act="expP" data-id="'+esc(id)+'">PDF</button></div>':'')+'</div>'+detailHTML(inv,f),true);
}

/* ===================== CONTEO ===================== */
function vCount(){
  var inv=byId(ui.invId);if(!inv)return '<div class="card">Inventario no encontrado.</div>';
  var p=progress(inv),fin=inv.estado==='FINALIZADO';
  return '<div class="row sp" style="margin-bottom:12px"><div><button class="btn s" data-act="nav" data-v="inventories">← Inventarios</button><h1 style="margin-top:8px">Conteo · '+esc(inv.idInventario)+' '+badge(inv.estado)+'</h1><div class="muted">'+esc(inv.titulo)+'</div></div>'+
   '<div class="row">'+(!fin?'<button class="btn p" data-act="scanOpen">📷 Escanear QR / barras</button>':'')+recountAction(inv,'btn a')+(!fin&&can('finalize')?'<button class="btn" data-act="finalizeAsk" data-id="'+esc(inv.idInventario)+'">Finalizar</button>':'')+'</div></div>'+
   (fin?'<div class="err" style="background:#ecfdf5;border-color:#a7f3d0;color:#065f46;margin-bottom:12px">Inventario finalizado y bloqueado. Exactitud final: <b>'+inv.indicadorExactitud+'%</b>.</div>':'')+
   '<div class="card" style="margin-bottom:12px"><div class="row sp"><b>'+p.c+' / '+p.t+' contados</b><span class="muted small">Exactitud estimada: <b>'+inv.indicadorExactitud+'%</b> · '+(showTheo(inv)?'Stock teórico visible':'Conteo ciego')+'</span></div><div style="margin-top:8px">'+bar(p.p)+'</div></div>'+
   '<div class="row" style="margin-bottom:10px"><input id="cq" style="flex:1;min-width:180px" placeholder="Buscar SKU, código o descripción…" value="'+esc(ui.cq)+'" autocomplete="off">'+
   '<input id="usb" style="max-width:220px" placeholder="⌁ Lector USB (Enter)" autocomplete="off">'+
   '<select id="cf" style="max-width:190px"><option value="pending"'+(ui.cf==='pending'?' selected':'')+'>Sin contar ('+(p.t-p.c)+')</option><option value="counted"'+(ui.cf==='counted'?' selected':'')+'>Contados ('+p.c+')</option><option value="all"'+(ui.cf==='all'?' selected':'')+'>Todos ('+p.t+')</option></select></div>'+
   '<div class="col" id="clist">'+countListHTML(inv)+'</div>';
}
function countListHTML(inv){
  var q=ui.cq.toLowerCase(),th=showTheo(inv),fin=inv.estado==='FINALIZADO';
  var L=inv.items.filter(function(i){return (!q||(i.sku+' '+i.barcode+' '+i.descripcion).toLowerCase().indexOf(q)>=0)&&(ui.cf==='all'||(ui.cf==='pending'&&i.conteo1===null)||(ui.cf==='counted'&&i.conteo1!==null))});
  if(!L.length)return (ui.cf==='pending'&&!q&&!fin)?'<div class="card center" style="padding:30px"><div style="font-size:26px">✅</div><b>¡Todos los artículos fueron contados!</b><div class="muted small">Revise o corrija con el filtro «Contados», o finalice el inventario.</div></div>':'<div class="card muted center">Sin resultados.</div>';
  return L.slice(0,300).map(function(i){var done=i.conteo1!==null,d=done&&finalQty(i)!==i.stockTeorico;
    return '<div class="item '+(done?(th&&d?'diff':'done'):'')+'"><div style="min-width:0;flex:1"><b>'+esc(i.descripcion)+'</b><div class="small muted mono">'+esc(i.sku)+(i.barcode&&i.barcode!==i.sku?' · '+esc(i.barcode):'')+'</div><div class="small muted">'+esc(i.ubicacion||'')+' '+esc(i.categoriaMarca||'')+'</div>'+
     (th?'<div class="small">Teórico: <b>'+i.stockTeorico+'</b></div>':'')+(i.notas?'<div class="small muted">📝 '+esc(i.notas)+'</div>':'')+'</div>'+
     '<div class="right">'+(done?'<div class="qty">'+i.conteo1+'</div><div class="small muted">'+esc((i.datetimeConteo1||'').slice(11,16))+'</div>':'<span class="badge b-in">Sin contar</span>')+'</div>'+
     (!fin&&can('count')?'<button class="btn '+(done?'':'p')+'" data-act="countModal" data-item="'+esc(i.idDetalle)+'">'+(done?(isSb()?'Ver / agregar':'Corregir'):'Contar')+'</button>':'')+'</div>'}).join('')+(L.length>300?'<div class="muted small center">Mostrando 300 de '+L.length+'. Use el buscador.</div>':'');
}
function openCountModal(itemId,mode){if(mode!=='recount'&&isSb())return openEntryModal(itemId);
  var inv=byId(ui.invId),it=inv&&inv.items.find(function(x){return x.idDetalle===itemId});
  var rec=mode==='recount';if(rec){need('doRecount');if(!openInventory(inv)||!inv.reconteoHabilitado||!it||!it.requiereReconteo)throw new Error('Este artículo no está habilitado para el segundo conteo.');if(it.conteo2!=null)throw new Error('El segundo conteo ya está registrado.')}
  if(!it)return;
  var th=!rec&&showTheo(inv),cur=rec?null:it.conteo1;
  openModal('<h2>'+(rec?'2do conteo':'Registrar conteo')+'</h2><div style="margin:10px 0"><b>'+esc(it.descripcion)+'</b><div class="small muted mono">'+esc(it.sku)+' '+esc(it.barcode)+'</div><div class="small muted">'+esc(it.ubicacion||'')+'</div>'+
   (th?'<div style="margin-top:4px">Stock teórico: <b>'+it.stockTeorico+'</b></div>':'')+(rec?'<div>Conteo 1: <b>'+(it.conteo1??'Sin registrar')+'</b></div>':'')+'</div>'+
   '<form id="countForm" data-item="'+esc(itemId)+'" data-mode="'+(rec?'recount':'count')+'" class="col"><div><label>Cantidad contada</label><input id="cn_q" type="number" inputmode="numeric" min="0" step="1" required autofocus value="'+(cur==null?'':cur)+'" style="font-size:22px;font-weight:800"></div>'+
   '<div><label>Observaciones (opcional)</label><input id="cn_n" maxlength="200" value="'+esc(it.notas||'')+'"></div>'+
   '<div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn p">Guardar</button></div></form>');
  setTimeout(function(){var e=$('#cn_q');if(e){e.focus();e.select()}},60);
}
/* escáner */
var scanner=null;
function stopScanner(){if(scanner){var s=scanner;scanner=null;try{s.stop().then(function(){s.clear()}).catch(function(){})}catch(e){}}}
function openScanner(mode){
  openModal('<div class="row sp"><h2>Escáner QR / Código de barras</h2><button class="btn s" data-act="closeModal">✕</button></div><div id="qr-reader" style="margin:12px 0"></div><div id="qr-msg" class="small muted">Iniciando cámara…</div>'+
   '<div class="row" style="margin-top:10px"><label class="btn"><input type="file" accept="image/*" id="qrimg" style="display:none">🖼 Escanear desde imagen</label></div>'+
   '<form id="manualCode" class="row" style="margin-top:12px;flex-wrap:nowrap" data-mode="'+(mode||'count')+'"><input id="mc" placeholder="O escriba SKU / código manualmente" autocomplete="off"><button class="btn p">Buscar</button></form>');
  loadScript(CDN.qr).then(function(){
    if(!$('#qr-reader'))return;scanner=new Html5Qrcode('qr-reader');
    return scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:160}},function(t){if(scanner)handleCode(t)},function(){})
  }).then(function(){var m=$('#qr-msg');if(m)m.textContent='Apunte la cámara al código.'}).catch(function(e){var m=$('#qr-msg');if(m)m.textContent='Cámara no disponible ('+e.message+'). Use una imagen, un lector USB o escriba el código.'});
}
function findByCode(inv,raw){
  raw=String(raw||'').trim();var c=[raw.toLowerCase()];
  if(raw.charAt(0)==='{')try{var j=JSON.parse(raw);['sku','codigo','barcode'].forEach(function(k){if(j[k])c.push(clean(j[k]).toLowerCase())})}catch(e){}
  return inv.items.find(function(i){return c.indexOf(i.sku.toLowerCase())>=0||(i.barcode&&c.indexOf(i.barcode.toLowerCase())>=0)});
}
function handleCode(raw){
  var inv=byId(ui.invId);if(!inv)return;var it=findByCode(inv,raw);
  if(ui.view==='recount'){if(!it||!it.requiereReconteo){toast('warning','Ítem fuera del 2do conteo','Seleccione un producto habilitado.');return}if(it.conteo2!=null){toast('info','2do conteo ya registrado');return}stopScanner();openCountModal(it.idDetalle,'recount');return}
  if(it){stopScanner();openCountModal(it.idDetalle,'count');return}
  stopScanner();var code=clean(raw),sku=code,desc='';
  if(String(raw).trim().charAt(0)==='{')try{var j=JSON.parse(raw);sku=clean(j.sku||j.codigo||j.barcode||code);desc=clean(j.descripcion||'')}catch(e){}
  openModal('<h2>Código no listado</h2><div class="muted" style="margin:6px 0 12px">«'+esc(code)+'» no existe en este inventario. Puede añadirlo como ítem adicional (stock teórico 0).</div>'+
   '<form id="addScanForm" class="col"><div class="grid g2"><div><label>SKU</label><input id="as_sku" value="'+esc(sku)+'" required></div><div><label>Código de barras</label><input id="as_bc" value="'+esc(code)+'"></div></div>'+
   '<div><label>Descripción</label><input id="as_d" value="'+esc(desc)+'" placeholder="Descripción del artículo"></div><div class="grid g2"><div><label>Ubicación</label><input id="as_u" value="Bodega General"></div><div><label>Cantidad contada</label><input id="as_q" type="number" min="0" step="1" value="1" required></div></div>'+
   '<div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn p">Añadir y contar</button></div></form>');
}

/* ===================== 2DO CONTEO ===================== */
function vRecount(){
  var inv=byId(ui.invId);if(!can('doRecount')||!openInventory(inv)||!inv.reconteoHabilitado)return '<div class="card"><button class="btn s" data-act="nav" data-v="inventories">Inventarios</button><p>El segundo conteo no está disponible.</p></div>';
  var L=inv.items.filter(function(i){return i.requiereReconteo||i.conteo2!=null}),pend=L.filter(function(i){return i.conteo2==null}).length;
  return '<div class="row sp" style="margin-bottom:12px"><div><button class="btn s" data-act="nav" data-v="inventories">← Inventarios</button><h1 style="margin-top:8px">2do conteo · '+esc(inv.idInventario)+'</h1><div class="muted">Revise el primer conteo y registre la cantidad del segundo conteo.</div></div>'+
   '<div class="row">'+(can('count')?'<button class="btn" data-act="openCount" data-id="'+esc(inv.idInventario)+'">← Conteo 1</button>':'')+(pend?'<button class="btn" data-act="scanOpen" data-m="recount">📷 Escanear</button>':'')+(can('finalize')?'<button class="btn p" data-act="finalizeAsk" data-id="'+esc(inv.idInventario)+'">Finalizar inventario</button>':'')+'</div></div>'+
   '<div class="card" style="margin-bottom:12px"><b>'+(L.length-pend)+' / '+L.length+' recontados</b> · pendientes: '+pend+'<div style="margin-top:8px">'+bar(L.length?(L.length-pend)/L.length*100:100)+'</div></div>'+
   (L.length?'<div class="col">'+L.map(function(i){var c2=i.conteo2!=null;return '<div class="item '+(c2?'done':'diff')+'"><div style="flex:1;min-width:0"><b>'+esc(i.descripcion)+'</b><div class="small muted mono">'+esc(i.sku)+'</div><div class="small muted">'+esc(i.ubicacion||'')+'</div>'+
    '<div class="small">Conteo 1: <b>'+(i.conteo1??'Sin registrar')+'</b></div></div>'+
    '<div class="right">'+(c2?'<div class="small muted">2do conteo registrado</div><div class="qty">'+i.conteo2+'</div>':'<span class="badge b-wa">Pendiente</span>')+'</div>'+
    (!c2?'<button class="btn a" data-act="recountModal" data-item="'+esc(i.idDetalle)+'">Registrar 2do conteo</button>':'')+'</div>'}).join('')+'</div>':'<div class="card center muted" style="padding:30px">No hay ítems para recontar.</div>');
}

/* ===================== REPORTES ===================== */
function vReports(){
  var fin=vis().filter(function(i){return i.estado==='FINALIZADO'});
  var acc=fin.length?(fin.reduce(function(a,i){return a+i.indicadorExactitud},0)/fin.length).toFixed(1):'—';
  var mins=fin.reduce(function(a,i){return a+i.duracionMinutos},0),units=fin.reduce(function(a,i){return a+i.items.length},0);
  var chart=fin.slice(0,12).reverse(),w=Math.max(320,chart.length*64);
  var svg=chart.length?'<svg viewBox="0 0 '+w+' 190" style="width:100%;max-height:230px">'+chart.map(function(i,k){var h=i.indicadorExactitud*1.4,x=k*64+14;return '<rect x="'+x+'" y="'+(160-h)+'" width="36" height="'+h+'" rx="4" fill="'+(i.indicadorExactitud>=95?'#059669':i.indicadorExactitud>=85?'#0F4C81':'#E65100')+'"/><text x="'+(x+18)+'" y="'+(154-h)+'" font-size="10" text-anchor="middle" fill="#334155" font-weight="700">'+i.indicadorExactitud+'%</text><text x="'+(x+18)+'" y="176" font-size="8.5" text-anchor="middle" fill="#64748b">'+esc(i.idInventario.slice(4))+'</text>'}).join('')+'</svg>':'<div class="muted center" style="padding:30px">No hay inventarios finalizados para graficar.</div>';
  var diffs={};S.traceability.forEach(function(t){if(t.diferencia!==0){var d=diffs[t.sku]=diffs[t.sku]||{sku:t.sku,desc:t.descripcion,n:0,net:0};d.n++;d.net+=t.diferencia}});
  var top=Object.keys(diffs).map(function(k){return diffs[k]}).sort(function(a,b){return b.n-a.n||Math.abs(b.net)-Math.abs(a.net)}).slice(0,8);
  return '<div class="row sp" style="margin-bottom:14px"><div><h1>Reportes y trazabilidad</h1><div class="muted">Exactitud histórica, tiempos y auditoría por SKU.</div></div>'+
   (can('reports')?'<div class="row"><button class="btn" data-act="expGeneral">⬇ Exportar general (.xlsx)</button><button class="btn" data-act="expTrace">⬇ Exportar trazabilidad</button></div>':'')+'</div>'+
   '<div class="grid g4" style="margin-bottom:14px">'+kpi(acc==='—'?acc:acc+'%','Exactitud global')+kpi(fin.length,'Inventarios finalizados')+kpi(mins+' min','Tiempo total liquidado')+kpi(fmtN(units),'Artículos auditados')+'</div>'+
   '<div class="grid g2" style="margin-bottom:14px"><div class="card"><h2 style="margin-bottom:8px">Exactitud por inventario</h2>'+svg+'</div>'+
   '<div class="card"><h2 style="margin-bottom:8px">SKUs con descuadres recurrentes</h2>'+(top.length?'<table><thead><tr><th>SKU</th><th>Producto</th><th class="right">Veces</th><th class="right">Neto</th></tr></thead><tbody>'+top.map(function(d){return '<tr><td class="mono">'+esc(d.sku)+'</td><td>'+esc(d.desc)+'</td><td class="right">'+d.n+'</td><td class="right"><span class="badge '+(d.net<0?'b-er':'b-wa')+'">'+(d.net>0?'+':'')+d.net+'</span></td></tr>'}).join('')+'</tbody></table>':'<div class="muted center" style="padding:30px">Sin descuadres registrados.</div>')+'</div></div>'+
   '<div class="card" style="margin-bottom:14px"><h2 style="margin-bottom:8px">Comparativa de procesos</h2><div class="tw"><table><thead><tr><th>ID</th><th>Título</th><th>Estado</th><th>Inicio / Fin</th><th class="right">Duración</th><th class="right">SKUs</th><th class="right">Exactitud</th></tr></thead><tbody>'+
   (vis().map(function(i){return '<tr><td class="mono">'+esc(i.idInventario)+'</td><td>'+esc(i.titulo)+'</td><td>'+badge(i.estado)+'</td><td class="small">'+esc(i.fechaHoraInicio||'-')+'<br>'+esc(i.fechaHoraFin||'-')+'</td><td class="right">'+i.duracionMinutos+' min</td><td class="right">'+i.items.length+'</td><td class="right"><b>'+i.indicadorExactitud+'%</b></td></tr>'}).join('')||'<tr><td colspan="7" class="center muted">Sin datos</td></tr>')+'</tbody></table></div></div>'+
   '<div class="card"><div class="row sp"><h2>Trazabilidad histórica por SKU</h2><input id="tq" style="max-width:260px" placeholder="Filtrar por SKU o producto…" value="'+esc(ui.tq)+'"></div><div id="tlist">'+traceHTML()+'</div></div>';
}
function traceHTML(){
  var q=ui.tq.toLowerCase(),L=S.traceability.filter(function(t){return !q||(t.sku+' '+t.descripcion).toLowerCase().indexOf(q)>=0});
  return '<div class="tw" style="margin-top:8px"><table><thead><tr><th>Fecha</th><th>Inventario</th><th>SKU</th><th>Producto</th><th class="right">Teórico</th><th class="right">Contado</th><th class="right">Dif.</th><th>Resp.</th></tr></thead><tbody>'+
   (L.slice(0,200).map(function(t){return '<tr><td class="small">'+esc(t.fechaRegistro)+'</td><td class="mono">'+esc(t.idInventario)+'</td><td class="mono">'+esc(t.sku)+'</td><td>'+esc(t.descripcion)+'</td><td class="right">'+t.stockTeorico+'</td><td class="right">'+t.cantidadContada+'</td><td class="right"><span class="badge '+(t.diferencia===0?'b-ok':t.diferencia<0?'b-er':'b-wa')+'">'+(t.diferencia>0?'+':'')+t.diferencia+'</span></td><td class="small">'+esc(t.responsable)+'</td></tr>'}).join('')||'<tr><td colspan="8" class="center muted" style="padding:20px">Sin registros de trazabilidad.</td></tr>')+'</tbody></table></div>'+(L.length>200?'<div class="small muted">Mostrando 200 de '+L.length+'.</div>':'');
}

/* ===================== USUARIOS ===================== */
function vUsers(){
  var L=S.users.filter(function(u){return !u.deleted});
  return '<div class="row sp" style="margin-bottom:14px"><div><h1>Usuarios y roles</h1><div class="muted">Acceso por usuario y contraseña para el personal de '+esc(S.company.name)+'.</div></div><button class="btn p" data-act="userModal">➕ Nuevo usuario</button></div>'+
   '<div class="card"><div class="tw"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Cargo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>'+
   L.map(function(u){return '<tr><td class="mono">'+esc(u.username)+'</td><td><b>'+esc(u.name)+'</b><div class="small muted">'+esc(u.email||'')+'</div></td><td>'+esc(u.cargo)+'</td><td><span class="badge b-in">'+esc(ROLES[u.role])+'</span></td>'+
    '<td>'+(u.active===false?'<span class="badge b-er">Inactivo</span>':'<span class="badge b-ok">Activo</span>')+(u.mustChange?' <span class="badge b-wa">Debe cambiar clave</span>':'')+'</td>'+
    '<td class="right"><button class="btn s" data-act="userModal" data-id="'+u.id+'">Editar</button> '+(u.id!==session.id?'<button class="btn s d" data-act="userDel" data-id="'+u.id+'">Eliminar</button>':'')+'</td></tr>'}).join('')+'</tbody></table></div></div>';
}
function openUserModal(id){
  var u=id?S.users.find(function(x){return x.id===id}):null;
  openModal('<h2>'+(u?'Editar usuario':'Nuevo usuario')+'</h2><form id="userForm" data-id="'+(u?u.id:'')+'" class="col" style="margin-top:10px" autocomplete="off">'+
   '<div class="grid g2"><div><label>Usuario (login)</label><input id="u_un" value="'+esc(u?u.username:'')+'" '+(u?'disabled':'required')+' autocapitalize="none"></div><div><label>Nombre completo</label><input id="u_nm" value="'+esc(u?u.name:'')+'" required></div></div>'+
   '<div class="grid g2"><div><label>Correo (opcional)</label><input id="u_em" type="email" value="'+esc(u?u.email:'')+'"></div><div><label>Cargo / Área</label><input id="u_cg" value="'+esc(u?u.cargo:'')+'"></div></div>'+
   '<div class="grid g2"><div><label>Rol</label><select id="u_rl">'+Object.keys(ROLES).map(function(r){return '<option value="'+r+'" '+(u&&u.role===r?'selected':'')+'>'+ROLES[r]+'</option>'}).join('')+'</select></div>'+
   '<div><label>'+(u?'Nueva contraseña (vacío = no cambiar)':'Contraseña inicial')+'</label><input id="u_pw" type="text" autocomplete="new-password" '+(u?'':'required')+' placeholder="mín. 8, letras y números"></div></div>'+
   '<label class="row" style="font-weight:600"><input type="checkbox" id="u_mc" '+(!u||u.mustChange?'checked':'')+'> Obligar a cambiar la contraseña en el próximo inicio de sesión</label>'+
   (u?'<label class="row" style="font-weight:600"><input type="checkbox" id="u_ac" '+(u.active!==false?'checked':'')+'> Usuario activo</label>':'')+
   '<div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn p">Guardar</button></div></form>');
}
function openPwModal(forced){
  openModal('<h2>'+(forced?'Debe cambiar su contraseña':'Cambiar contraseña')+'</h2>'+(forced?'<div class="muted" style="margin:6px 0">Por seguridad, defina una contraseña personal antes de continuar.</div>':'')+
   '<form id="pwForm" data-forced="'+(forced?1:'')+'" class="col" style="margin-top:10px"><div><label>Contraseña actual</label><input id="pw0" type="password" autocomplete="current-password" required></div>'+
   '<div><label>Nueva contraseña</label><input id="pw1" type="password" autocomplete="new-password" required placeholder="mín. 8 caracteres, letras y números"></div><div><label>Confirmar nueva contraseña</label><input id="pw2" type="password" autocomplete="new-password" required></div>'+
   '<div class="row" style="justify-content:flex-end">'+(forced?'<button type="button" class="btn" data-act="logout">Cerrar sesión</button>':'<button type="button" class="btn" data-act="closeModal">Cancelar</button>')+'<button class="btn p">Guardar</button></div></form>');
}

/* ===================== AJUSTES ===================== */
function vSettings(){
  var I=S.integration,c=S.company;
  return '<div style="margin-bottom:14px"><h1>Ajustes</h1><div class="muted">Datos de la empresa, Google Sheets, respaldos y auditoría.</div></div>'+
  '<div class="grid g2"><div class="card col"><h2>Empresa</h2><form id="coForm" class="col"><div><label>Razón social</label><input id="co_n" value="'+esc(c.name)+'" required></div><div class="grid g2"><div><label>NIT</label><input id="co_nit" value="'+esc(c.nit)+'"></div><div><label>Sede principal</label><input id="co_s" value="'+esc(c.sedePrincipal||'')+'"></div></div><div><button class="btn p">Guardar empresa</button></div></form></div>'+
  '<div class="card col"><h2>Respaldo de datos</h2><div class="muted small">Los datos viven en este navegador. Descargue respaldos periódicos o sincronice con Google Sheets.</div><div class="row"><button class="btn" data-act="backup">⬇ Descargar respaldo (.json)</button><label class="btn">⬆ Restaurar respaldo<input type="file" id="restore" accept=".json" style="display:none"></label></div></div></div>'+
  '<div class="card col" style="margin-top:14px"><div class="row sp"><h2>Sincronización con Google Sheets</h2>'+(I.lastSyncAt?'<span class="badge '+(I.lastSyncStatus==='error'?'b-er':'b-ok')+'">'+esc(I.lastSyncStatus==='error'?'Error':'OK')+' · '+esc(I.lastSyncAt)+'</span>':'<span class="badge b-in">Sin sincronizar</span>')+'</div>'+
  (I.lastSyncMessage?'<div class="small muted">'+esc(I.lastSyncMessage)+'</div>':'')+
  '<form id="intForm" class="col"><div><label>URL del servidor (Google Apps Script)</label><input id="i_url" value="'+esc(I.url)+'" placeholder="https://script.google.com/macros/s/…/exec"></div>'+
  '<label class="row" style="font-weight:600"><input type="checkbox" id="i_auto" '+(I.auto?'checked':'')+'> Sincronizar automáticamente (al guardar y cada 30 s)</label>'+
  '<div class="row"><button class="btn p">Guardar</button><button type="button" class="btn" data-act="intTest">Probar conexión</button><button type="button" class="btn" data-act="intSync">⟳ Sincronizar ahora</button>'+(I.spreadsheetUrl?'<a class="btn" target="_blank" rel="noopener" href="'+esc(I.spreadsheetUrl)+'">Abrir hoja ↗</a>':'')+'</div></form>'+
  '</div>'+
  '<div class="card" style="margin-top:14px"><h2 style="margin-bottom:8px">Bitácora de auditoría (últimos 60)</h2><div class="tw" style="max-height:300px"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>'+
  (S.audit||[]).slice(0,60).map(function(a){return '<tr><td class="small">'+esc(a.t)+'</td><td class="mono">'+esc(a.u)+'</td><td>'+esc(a.a)+'</td><td class="small muted">'+esc(a.d)+'</td></tr>'}).join('')+'</tbody></table></div></div>';
}

/* ===================== RENDER ===================== */
function render(){
  var app=$('#app');
  if(!session){app.innerHTML=vLogin(ui.loginErr);return}
  var v=ui.view,inner;
  if(v==='dashboard')inner=vDashboard();else if(v==='create')inner=can('createInv')?vCreate():vDashboard();
  else if(v==='inventories')inner=vInventories();else if(v==='count')inner=vCount();else if(v==='recount')inner=vRecount();
  else if(v==='reports')inner=can('reports')?vReports():vDashboard();else if(v==='users')inner=can('users')?vUsers():vDashboard();
  else if(v==='settings')inner=can('settings')?vSettings():vDashboard();else inner=vDashboard();
  app.innerHTML=vShell(inner);
  if(v==='create')renderStage();
  if(session.mustChange&&!$('#pwForm'))openPwModal(true);
}
function refreshLive(){ // tras sincronización o cambio en otra pestaña, sin perder el foco ni los modales
  if(!session||$('#modal').innerHTML)return;
  var a=document.activeElement;if(a&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)){if(ui.view==='count'&&$('#clist')){var iv=byId(ui.invId);if(iv)$('#clist').innerHTML=countListHTML(iv)}return}var sy=window.scrollY;
  if(ui.view!=='create'){render();window.scrollTo(0,sy)}
}
function go(v){stopScanner();ui.view=v;render();window.scrollTo(0,0)}
function fail(e){toast('error','No se pudo completar la acción',e&&e.message?e.message:String(e))}

/* ===================== EVENTOS ===================== */
var H={entEdit:function(el){var f=$('#entryForm');f.dataset.entry=el.dataset.e;$('#en_q').value=el.dataset.q;$('#en_l').textContent='Corregir la cantidad de este registro';$('#en_b').textContent='Guardar cambio';$('#en_q').focus()},entDel:function(el){var it=$('#entryForm').dataset.item;delEntry(ui.invId,it,el.dataset.e);toast('info','Registro eliminado');openEntryModal(it);render()},
  nav:function(el){go(el.dataset.v)},
  loginPing:async function(){if($('#lbk')&&$('#lbk').value==='supabase'){sbSaveLogin();var e0=$('#lstatus');e0.textContent='Probando…';try{await sbEnsure();var q0=await sbc.from('kv').select('id',{count:'exact',head:true});e0.innerHTML=(q0.error&&q0.error.code!=='42501')?'<span style="color:#dc2626">✖ '+esc(q0.error.message)+'</span>':'<span style="color:#059669">✔ Conexión con Supabase establecida.</span>'}catch(x){e0.innerHTML='<span style="color:#dc2626">✖ '+esc(x.message)+'</span>'}return}var el=$('#lstatus'),i=$('#lsrv'),u=(i&&i.value.trim())||S.integration.url;
    if(!u){el.textContent='Escriba primero la URL del servidor.';return}
    S.integration.url=u;save({noSync:true});el.textContent='Probando…';
    try{var r=await gas('ping',{},true);el.innerHTML='<span style="color:#059669">✔ Conexión establecida con el servidor.</span>'+(r.instalado?'':'<br><span style="color:#d97706">⚠ El servidor aún no tiene usuarios configurados. Contacte al administrador.</span>')}
    catch(e){el.innerHTML='<span style="color:#dc2626">✖ '+esc(e.message)+'</span>'}},
  logout:function(){closeModal();logout()},
  togglePw:function(){var p=$('#lp');p.type=p.type==='password'?'text':'password'},
  closeModal:function(){closeModal()},
  ovClick:function(el,e){if(e.target===el&&!$('#pwForm')){var f=$('#correctionForm');if(f){if(f.dataset.saving!=='1')openDetail(f.dataset.id,f.dataset.f)}else closeModal()}},
  tab:function(el){ui.tab=el.dataset.t;render()},
  openCount:function(el){var id=el.dataset.id;startInventory(id);ui.invId=id;ui.cf='all';ui.cq='';go('count');toast('success','Conteo listo',id)},
  openRecount:function(el){ui.invId=el.dataset.id;go('recount')},
  enableRecount:function(el){var id=el.dataset.id,n=enableRecount(id);ui.invId=id;
    if(n===0)toast('info','No hay ítems para recontar','No existen diferencias entre el conteo 1 y el stock teórico.');
    else toast('warning','2do conteo habilitado','Se aislaron '+n+' ítems con variación.');
    if(el.dataset.go||ui.view!=='inventories')go('recount');else render()},
  toggleTheo:function(el){var i=byId(el.dataset.id);toggleTheo(i.idInventario,!i.mostrarStockTeorico);toast('success',i.mostrarStockTeorico?'Stock teórico visible':'Modo ciego activado',i.idInventario);render()},
  detail:function(el){openDetail(el.dataset.id)},
  detailF:function(el){var f=$('#correctionForm');if(!f||f.dataset.saving!=='1')openDetail(el.dataset.id,el.dataset.f)},
  expX:async function(el){await exportInvXlsx(byId(el.dataset.id),false)},
  expXd:async function(el){await exportInvXlsx(byId(el.dataset.id),true)},
  expP:async function(el){await exportInvPdf(byId(el.dataset.id))},
  delInv:function(el){var id=el.dataset.id;openModal('<h2>Eliminar inventario</h2><p>¿Eliminar <b>'+esc(id)+'</b> (pendiente)? Esta acción no se puede deshacer.</p><div class="row" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Cancelar</button><button class="btn d" data-act="delInvOk" data-id="'+esc(id)+'">Eliminar</button></div>')},
  delInvOk:function(el){deleteInventory(el.dataset.id);closeModal();toast('info','Inventario eliminado',el.dataset.id);render()},
  finalizeAsk:function(el){
    var inv=byId(el.dataset.id),un=inv.items.filter(function(i){return i.conteo1===null}).length,pr=inv.items.filter(function(i){return i.requiereReconteo&&i.conteo2==null}).length,
        df=inv.items.filter(function(i){return hasCount(i)&&finalQty(i)!==i.stockTeorico}).length;
    openModal('<h2>Finalizar '+esc(inv.idInventario)+'</h2><p>Se bloquearán los registros y se generará la trazabilidad por SKU.</p><ul>'+
      (un?'<li><b>'+un+'</b> artículo(s) sin contar se registrarán con cantidad <b>0</b>.</li>':'')+(pr?'<li><b>'+pr+'</b> artículo(s) pendientes de 2do conteo.</li>':'')+'<li><b>'+df+'</b> artículo(s) con diferencia.</li><li>Exactitud actual: <b>'+inv.indicadorExactitud+'%</b></li></ul>'+
      '<div class="row" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Cancelar</button><button class="btn p" data-act="finalizeOk" data-id="'+esc(inv.idInventario)+'">Sí, confirmar y finalizar</button></div>')},
  finalizeOk:function(el){var inv=finalizeInventory(el.dataset.id);closeModal();toast('success','Inventario '+inv.idInventario+' finalizado','Exactitud final '+inv.indicadorExactitud+'%. Trazabilidad actualizada.');ui.tab='FINALIZADO';go('inventories')},
  countModal:function(el){openCountModal(el.dataset.item,'count')},
  recountModal:function(el){openCountModal(el.dataset.item,'recount')},
  scanOpen:function(el){openScanner(el.dataset.m)},
  template:function(){downloadTemplate()},
  addRowModal:function(){openModal('<h2>Agregar artículo manual</h2><form id="rowForm" class="col" style="margin-top:10px"><div class="grid g2"><div><label>SKU</label><input id="r_sku" required></div><div><label>Código de barras</label><input id="r_bc"></div></div><div><label>Descripción</label><input id="r_d" required></div><div class="grid g3"><div><label>Categoría</label><input id="r_c"></div><div><label>Ubicación</label><input id="r_u"></div><div><label>Stock teórico</label><input id="r_s" type="number" step="1" value="0" required></div></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn p">Agregar</button></div></form>')},
  rmRow:function(el){ui.stage.rows.splice(+el.dataset.i,1);renderStage()},
  clearStage:function(){ui.stage={rows:[],warnings:[],fileName:''};renderStage()},
  submitInv:function(){
    var inv=createInventory({titulo:$('#c_titulo').value,responsable:$('#c_resp').value,auditor:$('#c_aud').value,mostrarStockTeorico:$('#c_theo').checked,rows:ui.stage.rows});
    ui.stage={rows:[],warnings:[],fileName:''};toast('success','Inventario '+inv.idInventario+' creado',inv.items.length+' artículos en estado PENDIENTE.');ui.tab='ALL';go('inventories')},
  expGeneral:async function(){var rows=vis().map(function(i){var c=i.items.filter(function(x){return x.conteo1!==null}).length,d=i.items.filter(function(x){return hasCount(x)&&finalQty(x)!==x.stockTeorico}).length;
    return {'ID Inventario':i.idInventario,Título:i.titulo,Estado:i.estado,'Fecha':i.fechaRealizacion,'Inicio':i.fechaHoraInicio||'-','Fin':i.fechaHoraFin||'-','Duración (min)':i.duracionMinutos,Responsable:i.responsable,Auditor:i.auditor,'Total SKUs':i.items.length,'Contados':c,'Con diferencia':d,'Exactitud (%)':i.indicadorExactitud}});
    await exportXlsx([{name:'Inventarios_Consolidado',rows:rows}],'Reporte_General_Inventarios_'+now().slice(0,10)+'.xlsx')},
  expTrace:async function(){await exportXlsx([{name:'Trazabilidad_SKU',rows:S.traceability.map(function(t){return {Fecha:t.fechaRegistro,'ID Inventario':t.idInventario,'Título':t.tituloInventario,SKU:t.sku,Descripción:t.descripcion,'Stock Teórico':t.stockTeorico,'Cantidad Contada':t.cantidadContada,Diferencia:t.diferencia,Clasificación:clsOf(t.diferencia),Responsable:t.responsable,Notas:t.notas||'-'}})}],'Trazabilidad_Historica.xlsx')},
  userModal:function(el){openUserModal(el.dataset.id)},
  userDel:function(el){var u=S.users.find(function(x){return x.id===el.dataset.id});openModal('<h2>Eliminar usuario</h2><p>¿Eliminar a <b>'+esc(u.name)+'</b> ('+esc(u.username)+')? Perderá el acceso de inmediato.</p><div class="row" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Cancelar</button><button class="btn d" data-act="userDelOk" data-id="'+u.id+'">Eliminar</button></div>')},
  userDelOk:async function(el){await deleteUser(el.dataset.id);closeModal();toast('info','Usuario eliminado');render()},
  pwModal:function(){openPwModal(false)},
  intTest:async function(){saveIntForm();try{var r=await gas('ping',{},true);toast('success','Conexión exitosa','El servidor respondió correctamente.')}catch(e){fail(e)}},
  intSync:async function(){saveIntForm();srvRev=null;await syncNow(false);render()},

  backup:function(){var b=JSON.parse(JSON.stringify(persistable(S)));dl('respaldo_stockpulse_'+now().slice(0,10)+'.json',new Blob([JSON.stringify(b)],{type:'application/json'}));audit('respaldo','');save({noSync:true})}
};
function saveIntForm(){var I=S.integration;I.url=$('#i_url').value.trim();I.auto=$('#i_auto').checked;save({noSync:true})}
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-act]');if(!el||!H[el.dataset.act])return;
  try{var r=H[el.dataset.act](el,e);if(r&&r.catch)r.catch(fail)}catch(err){fail(err)}
  activity();
});
document.addEventListener('input',function(e){
  var t=e.target;
  if(t.id==='invq'){ui.q=t.value;$('#invlist').innerHTML=invListHTML()}
  else if(t.id==='cq'){ui.cq=t.value;$('#clist').innerHTML=countListHTML(byId(ui.invId))}
  else if(t.id==='tq'){ui.tq=t.value;$('#tlist').innerHTML=traceHTML()}
  activity();
});
document.addEventListener('change',function(e){
  var t=e.target;
  if(t.id==='cf'){ui.cf=t.value;$('#clist').innerHTML=countListHTML(byId(ui.invId))}
  else if(t.id==='c_file'&&t.files[0])doImport(t.files[0]);
  else if(t.id==='qrimg'&&t.files[0])scanImage(t.files[0]);
  else if(t.id==='restore'&&t.files[0])restoreBackup(t.files[0]);
});
async function doImport(f){
  var d=$('#drop');if(d)d.classList.add('on');
  try{var r=await importFile(f);ui.stage={rows:r.rows,warnings:r.warnings,fileName:f.name+' · '+(f.size/1024).toFixed(1)+' KB'};toast('success','Archivo procesado',r.rows.length+' artículos detectados.')}
  catch(e){ui.stage={rows:[],warnings:[],fileName:''};fail(e)}
  if(d)d.classList.remove('on');renderStage();var i=$('#c_file');if(i)i.value='';
}
document.addEventListener('dragover',function(e){if(e.target.closest&&e.target.closest('#drop')){e.preventDefault()}});
document.addEventListener('drop',function(e){if(e.target.closest&&e.target.closest('#drop')){e.preventDefault();if(e.dataTransfer.files[0])doImport(e.dataTransfer.files[0])}});
async function scanImage(f){
  try{await loadScript(CDN.qr);stopScanner();var tmp=document.createElement('div');tmp.id='qr-tmp';tmp.style.display='none';document.body.appendChild(tmp);
    var h=new Html5Qrcode('qr-tmp');var t=await h.scanFile(f,false);tmp.remove();handleCode(t)}
  catch(e){var m=$('#qr-msg');if(m)m.textContent='No se detectó ningún código en la imagen.'}
}
function restoreBackup(f){
  var r=new FileReader();r.onload=function(){try{var j=JSON.parse(r.result);if(!j.inventories||!j.company)throw new Error('El archivo no es un respaldo válido.');
    if(!confirm('Esto reemplazará los inventarios y la trazabilidad locales por los del respaldo (los usuarios viven en el servidor). ¿Continuar?'))return;
    S.company=j.company;S.inventories=j.inventories;pushed={};srvRev=null;S.traceability=j.traceability||[];audit('restaurar_respaldo','');save();toast('success','Respaldo restaurado');render()}catch(e){fail(e)}};
  r.readAsText(f);
}
document.addEventListener('submit',async function(e){
  e.preventDefault();var f=e.target;activity();
  try{
    if(f.id==='loginForm'){
      var btn=$('button[type=submit]',f);if(btn.disabled)return;btn.disabled=true;btn.textContent='Conectando con el servidor…';
      var slow=setTimeout(function(){if(btn.isConnected)btn.textContent='Esperando respuesta… (la primera vez puede tardar unos segundos)'},5000);
      await new Promise(function(r){setTimeout(r,30)});
      sbSaveLogin();var srv=$('#lsrv');if(srv&&srv.value.trim()&&srv.value.trim()!==S.integration.url){S.integration.url=srv.value.trim();S.integration.auto=true;save({noSync:true})}
      try{await serverLogin($('#lu').value,$('#lp').value);ui.loginErr='';ui.view='dashboard';render();toast('success','Sesión iniciada','Rol: '+ROLES[session.role]);syncNow(true)}
      catch(err){ui.loginErr=err.message;render()}
      finally{clearTimeout(slow)}
    }else if(f.id==='entryForm'){
      var itm=f.dataset.item,eid=f.dataset.entry;ui.lastUbic=$('#en_u').value;
      if(eid){await editEntry(ui.invId,itm,eid,$('#en_q').value);toast('success','Cantidad actualizada')}
      else{var r2=await addEntry(ui.invId,itm,$('#en_q').value,$('#en_u').value,$('#en_n').value);toast('success','Conteo agregado','Total del artículo: '+r2.conteo1)}
      closeModal();var sy1=window.scrollY;render();window.scrollTo(0,sy1);
    }else if(f.id==='countForm'){
      var it=f.dataset.item,q=$('#cn_q').value,n=$('#cn_n').value,left;var sy0=window.scrollY;setTimeout(function(){window.scrollTo(0,sy0)},30);
      if(f.dataset.mode==='recount'){left=await saveRecount(ui.invId,it,q,n);toast('success','2do conteo guardado',left==null?'Recargue para ver el estado actualizado.':left?left+' pendientes':'Todos los segundos conteos registrados.')}
      else{saveCount(ui.invId,it,q,n);toast('success','Conteo registrado')}
      closeModal();render();
    }else if(f.id==='correctionForm'){
      need('correctFinal');var id=f.dataset.id,item=f.dataset.item,filter=f.dataset.f,qty=$('#sc_q').valueAsNumber,reason=$('#sc_reason').value.trim();
      if(!Number.isSafeInteger(qty)||qty<0||!reason)throw new Error('Indique una cantidad entera no negativa y un motivo.');
      var result=await spRpc('sp_correct_final',{p_inv:id,p_item:item,p_qty:qty,p_reason:reason});
      var reloadOk=await spReloadAfterCountWrite();
      toast('success','Corrección final registrada','Cantidad final: '+result);
      if(f.isConnected){render();if(reloadOk&&byId(id))openDetail(id,filter);else closeModal()}
    }else if(f.id==='addScanForm'){
      await addScanned(ui.invId,{sku:$('#as_sku').value,barcode:$('#as_bc').value,descripcion:$('#as_d').value,ubicacion:$('#as_u').value,cantidad:$('#as_q').value});
      closeModal();toast('success','Ítem añadido y contado');render();
    }else if(f.id==='manualCode'){
      var raw=$('#mc').value;if(raw.trim())handleCode(raw)
    }else if(f.id==='rowForm'){
      var st=num($('#r_s').value);ui.stage.rows.push({sku:clean($('#r_sku').value),barcode:clean($('#r_bc').value),descripcion:clean($('#r_d').value),categoriaMarca:clean($('#r_c').value),ubicacion:clean($('#r_u').value),stockTeorico:st.v});closeModal();renderStage()
    }else if(f.id==='userForm'){
      var id=f.dataset.id,d={name:$('#u_nm').value,email:$('#u_em').value,cargo:$('#u_cg').value,role:$('#u_rl').value,password:$('#u_pw').value,mustChange:$('#u_mc').checked};
      if(id){if($('#u_ac'))d.active=$('#u_ac').checked;if(!d.password)delete d.password;await updateUser(id,d);toast('success','Usuario actualizado')}
      else{d.username=$('#u_un').value;await createUser(d);toast('success','Usuario creado',d.username)}
      closeModal();render();
    }else if(f.id==='pwForm'){
      if($('#pw1').value!==$('#pw2').value)throw new Error('La confirmación no coincide.');
      await changeOwnPassword($('#pw0').value,$('#pw1').value);closeModal();toast('success','Contraseña actualizada');render();
    }else if(f.id==='coForm'){
      need('settings');S.company.name=clean($('#co_n').value)||S.company.name;S.company.nit=clean($('#co_nit').value);S.company.sedePrincipal=clean($('#co_s').value);audit('editar_empresa','');save();toast('success','Empresa actualizada');render();
    }else if(f.id==='intForm'){
      need('settings');saveIntForm();audit('config_sheets','');toast('success','Configuración guardada');render();
    }
  }catch(err){fail(err)}finally{if(f){delete f.dataset.saving;var submitButton=f.querySelector('button:not([type="button"])');if(submitButton)submitButton.disabled=false}}
});
window.addEventListener('storage',function(e){if(e.key===KEY&&e.newValue&&!spRestoring&&!ui.resumeError){try{var u=S.users;S=JSON.parse(e.newValue);S.users=u;refreshLive()}catch(x){}}});
['mousemove','keydown','touchstart'].forEach(function(ev){document.addEventListener(ev,activity,{passive:true})});
setInterval(function(){if(!session||spRestoring)return;try{var j=JSON.parse(stGet('sessionStorage',SK));if(!j||Date.now()-j.last>=SP_INACTIVITY)forceLogout('Sesión cerrada por inactividad.')}catch(e){}},30000);
document.addEventListener('keydown',function(e){
  var correction=$('#correctionForm');
  if(e.key==='Escape'&&$('#modal').innerHTML&&!$('#pwForm')){if(correction){if(correction.dataset.saving!=='1')openDetail(correction.dataset.id,correction.dataset.f)}else closeModal()}
  if(e.key==='Tab'&&correction){var fields=$$('input,textarea,button:not([disabled])',correction),first=fields[0],last=fields[fields.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
  if(e.target&&e.target.id==='usb'&&e.key==='Enter'){e.preventDefault();var v=e.target.value;e.target.value='';var inv=byId(ui.invId),it=inv&&findByCode(inv,v);if(it)openCountModal(it.idDetalle,'count');else if(v.trim())handleCode(v)}});

/* Ajustes solicitados: Supabase, permisos y conteo concurrente. */
// Configuración de despliegue: solo URL y clave PUBLICA anon/publishable; nunca service_role.
// Si ya se configuraron en este navegador se conservan hasta completar estas constantes.
var SUPABASE_CONFIG = {url:'https://nqswlzzxxkbckpmtgsrh.supabase.co', anonKey:'sb_publishable_dmSiuycYfjEkTqrsnhHNFA_rQkT-WoY'};
S.integration.backend='supabase';
S.integration.sbUrl=SUPABASE_CONFIG.url||S.integration.sbUrl||'';
S.integration.sbKey=SUPABASE_CONFIG.anonKey||S.integration.sbKey||'';
S.integration.url=S.integration.sbUrl||'supabase';S.integration.auto=true;
var SP_LOCATIONS=['Bodega principal','Bodega secundaria','Tienda','Exhibición'];
var spBaseCan=can;
can=function(a){return a==='deleteInv'?!!session&&session.role==='ADMIN'&&session.is_primary_admin===true:spBaseCan(a)};
vis=function(){return S.inventories.filter(function(i){return !i.deleted&&(!session||session.role!=='OPERARIO'||['PENDIENTE','EN_CURSO'].indexOf(i.estado)>=0)})};
sbSaveLogin=function(){};
vLogin=function(err){return '<div class="login"><div class="box"><div class="hero"><div class="small">STOCKPULSE · TOMA FÍSICA DE INVENTARIOS</div><h1>'+esc(S.company.name)+'</h1><div class="small">NIT '+esc(S.company.nit)+'</div></div><form id="loginForm" autocomplete="on">'+(err?'<div class="err">'+esc(err)+'</div>':'')+'<div><label for="lu">Correo electrónico</label><input id="lu" name="username" type="email" autocomplete="username" autocapitalize="none" required autofocus></div><div><label for="lp">Contraseña</label><div class="row" style="flex-wrap:nowrap"><input id="lp" name="password" type="password" autocomplete="current-password" required><button type="button" class="btn" data-act="togglePw">Mostrar/ocultar</button></div></div><button class="btn p" type="submit">Iniciar sesión</button><div class="small muted center">Acceso restringido a personal autorizado de '+esc(S.company.name)+'.</div></form></div></div>'};
var spBaseEnsure=sbEnsure;
sbEnsure=async function(){
 var I=S.integration;if(!I.sbUrl||!I.sbKey)throw new Error('Falta la configuración de Supabase en el archivo publicado. [SP-CONFIG]');
 var project;try{project=new URL(I.sbUrl)}catch(e){throw new Error('La dirección del proyecto en el archivo publicado no es válida. [SP-CONFIG]')}
 if(!['https:','http:'].includes(project.protocol)||project.username||project.password)throw new Error('La dirección del proyecto en el archivo publicado no es válida. [SP-CONFIG]');
 if(location.protocol==='https:'&&project.protocol!=='https:')throw new Error('El sitio publicado usa HTTPS. Configure una dirección HTTPS para Supabase. [SP-HTTPS]');
 if(!sbc||sbUrlUsed!==I.sbUrl){
  try{await loadScript(SP_SDK_ASSET,SP_SDK_WAIT)}catch(e){throw new Error('No se pudo descargar un archivo de StockPulse. Revisa la conexión y que se haya desplegado el paquete completo. [SP-APP]')}
  if(!window.supabase||typeof window.supabase.createClient!=='function')throw new Error('No se pudo iniciar la conexión de StockPulse. [SP-APP]');
 }
 return spBaseEnsure();
};
var SP_VIEW=SK+'_view',spRestoring=false,SP_SDK_WAIT=8000,SP_FETCH_WAIT=10000,SP_READ_WAIT=14000;
function spAuthProblem(message,code){var err=new Error(message);err.code=code;return err}
function spReadTimeout(){return spAuthProblem('La conexión tardó demasiado en responder. [SP-RED]','sp_timeout')}
function spDeadline(task,ms,onTimeout){
 var timer;return Promise.race([Promise.resolve(task),new Promise(function(_,reject){timer=setTimeout(function(){reject(spReadTimeout());if(onTimeout)onTimeout()},ms)})]).finally(function(){clearTimeout(timer)});
}
function spReadQuery(query){
 var controller=new AbortController();return spDeadline(query.abortSignal(controller.signal),SP_READ_WAIT,function(){controller.abort()});
}
function spFetch(input,options){
 // Acotar lecturas y autenticación sin reintentar ni cambiar el resultado de una escritura de inventario.
 var opts=options||{},verb=String(opts.method||'GET').toUpperCase(),url=typeof input==='string'?input:String(input.url||input);
 if(!['GET','HEAD'].includes(verb)&&!url.includes('/auth/v1/'))return window.fetch(input,options);
 var upstream=opts.signal,ctrl=new AbortController(),abort=function(){ctrl.abort()};
 if(upstream&&upstream.aborted)abort();
 else if(upstream)upstream.addEventListener('abort',abort,{once:true});
 var timer=setTimeout(function(){abort();finish()},SP_FETCH_WAIT);
 function finish(){clearTimeout(timer);if(upstream)upstream.removeEventListener('abort',abort)}
 // Si llegaron las cabeceras pero se cortó la descarga, el límite aún cancela el cuerpo.
 return window.fetch(input,Object.assign({},opts,{signal:ctrl.signal})).then(function(r){if(!r.body)finish();return r},function(e){finish();throw e});
}
function spAuthInvalid(e){return e&&(e.name==='AuthSessionMissingError'||[401,403].includes(e.status)||['session_not_found','session_expired','user_not_found','user_banned','bad_jwt','refresh_token_not_found','refresh_token_already_used','sp_session_changed','sp_profile_inactive'].includes(e.code))}
function spNetworkError(e){
 return navigator.onLine===false||!e||e.name==='AuthRetryableFetchError'||e.status===0||['sp_timeout','sp_network'].includes(e.code)||/failed to fetch|networkerror|network request failed|load failed|aborterror|timeout|timed out/i.test((e.name||'')+' '+(e.message||''));
}
function spDataError(e){
 if(spNetworkError(e))return 'No se pudo contactar a Supabase. Compruebe la conexión y los permisos de red del sitio. [SP-RED]';
 return 'Supabase no pudo completar la sincronización de inventarios. [SP-DATOS]';
}
function spLoginError(e){
 if(e&&e.status>=500)return 'Supabase no pudo responder en este momento. Intente más tarde. [SP-SERVICIO]';
 if(spNetworkError(e))return 'No se pudo contactar a Supabase. Compruebe la conexión o si el alojamiento bloquea la solicitud. [SP-RED]';
 if(e.code==='email_not_confirmed')return 'El correo de esta cuenta aún no está confirmado. [SP-CORREO]';
 if(e.code==='invalid_credentials'||/invalid login credentials/i.test(e.message||''))return 'Correo o contraseña incorrectos.';
 if(/api.?key|publishable|no api key/i.test(e.message||'')||[401,403].includes(e.status))return 'Supabase rechazó la configuración de acceso. Revise la clave pública y que pertenezca al mismo proyecto. [SP-CLAVE]';
 if(e.status===429)return 'Se hicieron demasiados intentos. Espere un momento y vuelva a intentar. [SP-LIMITE]';
 return 'Supabase no pudo iniciar sesión. Consulte al administrador. [SP-AUTH]';
}
async function spReadProfile(user){
 var p=await spReadQuery(sbc.from('profiles').select('*').eq('id',user.id).single());
 if(p.error&&p.error.code!=='PGRST116'){if(p.status===0)throw spReadTimeout();throw p.error}
 if(!p.data||!p.data.active)throw spAuthProblem('Usuario sin perfil activo. Contacte al administrador.','sp_profile_inactive');
 return p.data;
}
function spActivateProfile(x,last){
 session={id:x.id,username:x.username,name:x.name,role:x.role,cargo:x.cargo||'',active:true,token:'sb',is_primary_admin:x.is_primary_admin===true};
 saveSess(last);return session;
}
async function spProfile(user,last){return spActivateProfile(await spReadProfile(user),last)}
function spResetCloudCache(){
 S.inventories=[];S.traceability=[];S.users=[];sbFirst=true;sbSent={};sbEst={};sbTs=SB0;sbOrph=[];
 S.integration.lastSyncAt=null;S.integration.lastSyncStatus='idle';S.integration.lastSyncMessage='';
}
function spStoredSession(){
 try{var j=JSON.parse(stGet('sessionStorage',SK));return j&&j.s&&j.s.token==='sb'&&j.s.id&&Number.isFinite(j.last)?j:null}catch(e){return null}
}
function spSaveView(){
 if(!session||spRestoring)return;
 var snapshot=JSON.stringify({user:session.id,project:S.integration.sbUrl,view:ui.view,id:ui.invId,tab:ui.tab,q:ui.q,cq:ui.cq,cf:ui.cf,lastUbic:ui.lastUbic});
 if(snapshot!==stGet('sessionStorage',SP_VIEW))stSet('sessionStorage',SP_VIEW,snapshot);
}
function spResumeView(){
 var last;try{last=JSON.parse(stGet('sessionStorage',SP_VIEW))}catch(e){}
 if(!last||last.user!==session.id||last.project!==S.integration.sbUrl)return;
 var inv=byId(last.id);
 if(last.view==='count'||last.view==='recount'){
  var ok=openInventory(inv)&&(last.view==='count'?can('count'):can('doRecount')&&inv.reconteoHabilitado);
  ui.view=ok?last.view:'inventories';ui.invId=ok?inv.idInventario:null;
 }else if(navItems().some(function(i){return i[0]===last.view}))ui.view=last.view;
 if(['ALL','PENDIENTE','EN_CURSO','FINALIZADO'].includes(last.tab)&&!(session.role==='OPERARIO'&&last.tab==='FINALIZADO'))ui.tab=last.tab;
 if(['all','counted','pending'].includes(last.cf))ui.cf=last.cf;
 if(typeof last.q==='string')ui.q=last.q;
 if(typeof last.cq==='string')ui.cq=last.cq;
 if(SP_LOCATIONS.includes(last.lastUbic))ui.lastUbic=last.lastUbic;
}
function spResumeScreen(){
 var error=ui.resumeError;
 return '<div class="login"><div class="box"><div class="hero"><div class="small">STOCKPULSE · TOMA FÍSICA DE INVENTARIOS</div><h1>'+esc(S.company.name)+'</h1></div><div class="card col">'+
   (error?'<div class="err" role="alert">'+esc(error)+'</div><p class="small muted" style="margin:0">No necesitas volver a iniciar sesión para reintentar.</p><button type="button" class="btn p" data-act="resumeSession">Reintentar sincronización</button>':'<div id="spResumeStatus" role="status">'+esc(ui.resumeStatus||'Verificando tu sesión…')+'</div>')+'</div></div></div>';
}
function spResumeProgress(message){
 ui.resumeStatus=message;var el=$('#spResumeStatus');if(el)el.textContent=message;
}
sbLogin=async function(user,pass){
 await sbEnsure();var r;
 try{r=await sbc.auth.signInWithPassword({email:String(user||'').trim(),password:pass||''})}catch(e){throw new Error(spLoginError(e))}
 if(r.error||!r.data||!r.data.user)throw new Error(spLoginError(r.error));
 try{await spProfile(r.data.user)}catch(e){
  try{await sbc.auth.signOut({scope:'local'})}catch(x){}session=null;
  throw new Error(e.code==='sp_profile_inactive'?e.message:spNetworkError(e)?spDataError(e):'Se autenticó la cuenta, pero no se pudo consultar su perfil. [SP-PERFIL]');
 }
 // No mezclar el caché de otro usuario ni volver a enviar datos antiguos al iniciar.
 spResetCloudCache();stDel('sessionStorage',SP_VIEW);
 save({noSync:true});spLoadAssignees(session);return session;
};
function spLoadAssignees(current){
 void sbUsers(current).then(function(){
  if(session!==current)return;
  if(ui.view==='users')refreshLive();
  if(ui.view==='create')['#c_resp','#c_aud'].forEach(function(id,i){
   var el=$(id);if(!el)return;var value=el.value;el.innerHTML=spAssigneeOptions(i===1);
   if(Array.prototype.some.call(el.options,function(opt){return opt.value===value}))el.value=value;
  });
 }).catch(function(){});
}
restoreSession=async function(){
 if(spRestoring||session)return;
 ui.resumeError='';var saved=spStoredSession();
 if(!saved){render();return}
 if(Date.now()-saved.last>=SP_INACTIVITY){
  stDel('sessionStorage',SK);stDel('sessionStorage',SP_VIEW);ui.loginErr='Sesión cerrada por inactividad.';render();return;
 }
 spRestoring=true;ui.resumeStatus='Verificando tu sesión…';render();
 try{
  if(navigator.onLine===false)throw spAuthProblem('No hay conexión a internet. [SP-RED]','sp_network');
  await sbEnsure();var r=await spDeadline(sbc.auth.getUser(),SP_READ_WAIT);
  if(r.error)throw r.error;
  if(!r.data||!r.data.user||r.data.user.id!==saved.s.id)throw spAuthProblem('La sesión ya no está disponible. Inicie sesión nuevamente.','sp_session_changed');
  var profile=await spReadProfile(r.data.user);
  spActivateProfile(profile,saved.last);spResetCloudCache();
  var received=0;spResumeProgress('Sesión verificada. Actualizando inventarios…');
  await sbPull(true,function(n){if(n){received+=n;spResumeProgress('Actualizando inventarios… '+fmtN(received)+' registros recibidos.')}});
  await sbPull(false,function(){});
  if(Date.now()-saved.last>=SP_INACTIVITY)throw spAuthProblem('Sesión cerrada por inactividad.','sp_session_changed');
  spResumeView();
  // La recarga parte de datos confirmados, no vuelve a enviarlos como cambios locales.
  S.inventories.forEach(function(inv){if(openInventory(inv))inv.indicadorExactitud=accuracy(inv.items);sbSent['inv:'+inv.idInventario]=JSON.stringify(sbData('inv',inv));inv.items.forEach(function(it){sbSent['item:'+it.idDetalle]=JSON.stringify(sbData('item',it))})});
  S.traceability.forEach(function(t){sbSent['trace:'+t.idTrazabilidad]=JSON.stringify(t)});
  sbFirst=false;S.integration.lastSyncAt=now();S.integration.lastSyncStatus='ok';S.integration.lastSyncMessage='Inventarios actualizados';save({noSync:true});
 }catch(e){
  session=null;
  if(sbCh){try{Promise.resolve(sbc.removeAllChannels()).catch(function(){})}catch(x){}sbCh=null;sbLive=false}
  if(spAuthInvalid(e)){
   stDel('sessionStorage',SK);stDel('sessionStorage',SP_VIEW);
   ui.loginErr=e.code==='sp_profile_inactive'||e.code==='sp_session_changed'?e.message:'Su sesión expiró. Inicie sesión nuevamente.';
  }else ui.resumeError=/\[SP-(?:APP|CONFIG|HTTPS|RED)\]$/.test(e.message||'')?e.message:spNetworkError(e)?'La conexión no respondió. Revisa tu red y reintenta. [SP-RED]':'No se pudieron actualizar los inventarios. Reintenta en unos segundos. [SP-DATOS]';
 }finally{spRestoring=false;render()}
 if(session){
  void sbEnsure().catch(function(){});
  spLoadAssignees(session);
 }
};
H.resumeSession=function(){return restoreSession()};
function spRetryOnReturn(){if(ui.resumeError&&!session&&navigator.onLine!==false&&!document.hidden)void restoreSession()}
window.addEventListener('online',spRetryOnReturn);
window.addEventListener('pageshow',function(e){if(e.persisted)spRetryOnReturn()});
document.addEventListener('visibilitychange',spRetryOnReturn);
window.addEventListener('pagehide',spSaveView);
refreshMe=async function(){await sbEnsure();var r=await sbc.auth.getUser();if(r.error||!r.data.user){forceLogout('Su sesión expiró.');return}await spProfile(r.data.user)};
var spBaseLogout=logout;
logout=function(){stDel('sessionStorage',SP_VIEW);spBaseLogout();S.inventories=[];S.traceability=[];S.users=[];save({noSync:true})};
var spBaseStop=sbStop;
sbStop=function(){spBaseStop()};
var spBaseData=sbData;
sbData=function(col,o,p){if(col==='entry')return Object.assign({},o,{idDetalle:p.idDetalle});return spBaseData(col,o,p)};
var spBaseApply=sbApply;
sbApply=function(r){
 if(r.col==='inv'&&session&&session.role==='OPERARIO'&&(r.data.deleted||r.data.estado==='FINALIZADO')){S.inventories=S.inventories.filter(function(i){return i.idInventario!==r.id});return 1}
 var inv=(r.col==='item'||r.col==='entry')&&S.inventories.find(function(i){return i.idInventario===r.inv}),exact=inv&&inv.indicadorExactitud;
 var ok=spBaseApply(r);
 if(ok&&inv){var it=inv.items.find(function(i){return i.idDetalle===(r.col==='item'?r.id:r.data.idDetalle)}),e=r.col==='entry'&&it&&(it.entradas||[]).find(function(e){return e.id===r.id});if(e)Object.assign(e,r.data,{id:r.id});if(!spRestoring)inv.indicadorExactitud=openInventory(inv)?accuracy(inv.items):exact;}
 return ok;
};
// Agregados del primer conteo siempre calculados a partir de entradas, nunca por sobrescritura.
var spBaseRecalc=recalc;
recalc=function(inv,it){spBaseRecalc(inv,it)};
async function spRpc(name,args){
 if(syncP)await syncP;
 await sbEnsure();var r=await sbc.rpc(name,args);if(r.error)throw new Error(r.error.message);
 return r.data;
}
async function spReload(){await sbPull(false);save({noSync:true})}
async function spReloadAfterCountWrite(){
 try{await spReload();return true}catch(e){toast('warning','Guardado en Supabase','No se pudo actualizar la pantalla. Sincronice antes de continuar.');return false}
}
// Las entradas y sus correcciones se escriben exclusivamente mediante RPC transaccional.
sbPush=async function(){
 if(!session||session.role==='CONSULTOR')return;
 var rows=[],adm=session.role!=='OPERARIO';
 S.inventories.forEach(function(inv){
  if(adm)rows.push({col:'inv',id:inv.idInventario,inv:inv.idInventario,data:sbData('inv',inv)});
  inv.items.forEach(function(it){
   if(adm||!sbSent['item:'+it.idDetalle])rows.push({col:'item',id:it.idDetalle,inv:inv.idInventario,data:sbData('item',it)});
  });
 });
 if(adm)S.traceability.forEach(function(t){rows.push({col:'trace',id:t.idTrazabilidad,inv:t.idInventario,data:t})});
 // Enviar por separado: un error de permisos nunca se confirma como éxito.
 for(var i=0;i<rows.length;i++){
  var r=rows[i],sig=JSON.stringify(r.data);if(sbSent[r.col+':'+r.id]===sig)continue;
  var res=await sbc.from('kv').upsert(r,{onConflict:'col,id'});if(res.error)throw new Error(res.error.message);
  sbSent[r.col+':'+r.id]=sig;
 }
};
addEntry=async function(id,itemId,qty,ubic,notes){
 need('count');if(!SP_LOCATIONS.includes(ubic))throw new Error('Seleccione una de las cuatro ubicaciones.');
 var result=await spRpc('sp_add_entry',{p_inv:id,p_item:itemId,p_qty:Number(qty),p_location:ubic,p_notes:notes||'',p_id:uid('en-')});
 await spReload();var inv=byId(id),it=inv&&inv.items.find(function(i){return i.idDetalle===itemId});
 if(result.previous_records>0)toast('warning','Conteo sumado','Había '+result.previous_total+' unidades. Nuevo total: '+result.total+'.');
 return it||{conteo1:result.total};
};
editEntry=delEntry=function(){throw new Error('Utilice Corregir cantidades en el detalle del inventario.')};
saveRecount=async function(id,itemId,qty,notes){
 need('doRecount');await spRpc('sp_save_recount',{p_inv:id,p_item:itemId,p_qty:Number(qty),p_notes:notes||''});
 if(!await spReloadAfterCountWrite())return null;
 var inv=byId(id);return inv?inv.items.filter(function(i){return i.requiereReconteo&&i.conteo2==null}).length:null;
};
startInventory=function(id){need('count');var inv=byId(id);if(!inv||inv.estado==='FINALIZADO')throw new Error('Inventario no disponible.');return inv};
enableRecount=async function(id){need('recount');var n=await spRpc('sp_enable_recount',{p_inv:id});await spReloadAfterCountWrite();return n};
deleteInventory=async function(id){need('deleteInv');await spRpc('sp_delete_inventory',{p_inv:id});await spReload();S.inventories=S.inventories.filter(function(i){return i.idInventario!==id});save({noSync:true})};
var spBaseOpenEntry=openEntryModal;
openEntryModal=function(itemId){
 spBaseOpenEntry(itemId);
 var field=$('#en_u');if(field){var selected=SP_LOCATIONS.includes(ui.lastUbic)?ui.lastUbic:'Bodega principal';field.outerHTML='<select id="en_u" required>'+SP_LOCATIONS.map(function(l){return '<option'+(l===selected?' selected':'')+'>'+esc(l)+'</option>'}).join('')+'</select>'}
 $$('#modal [data-act="entDel"],#modal [data-act="entEdit"]').forEach(function(b){b.remove()});
};
var spBaseDetails=detailHTML;
detailHTML=function(inv,f){
 var html=spBaseDetails(inv,f);if(!session||!['ADMIN','SUPERVISOR','CONSULTOR'].includes(session.role))return html;
 var rows=[];inv.items.forEach(function(it){(it.entradas||[]).filter(function(e){return !e.deleted}).sort(function(a,b){return String(a.created_at||a.fecha).localeCompare(String(b.created_at||b.fecha))||a.id.localeCompare(b.id)}).forEach(function(e,n){rows.push('<tr><td>'+esc(it.sku)+'</td><td>'+esc(it.descripcion)+'</td><td>'+esc(e.ubicacion)+'</td><td>'+e.qty+'</td><td>'+esc(e.usuario)+'</td><td>'+(n===0?'Primer registro':'Adición')+'</td><td>'+esc(e.created_at||e.fecha)+'</td><td>'+esc(e.correction_reason||'')+'</td></tr>')})});
 return html+'<h3 style="margin-top:18px">Trazabilidad del primer conteo por usuario y ubicación</h3><div class="tw"><table><thead><tr><th>SKU</th><th>Producto</th><th>Ubicación</th><th>Cantidad</th><th>Usuario original</th><th>Participación</th><th>Fecha original</th><th>Corrección histórica de entrada</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
};
var spBaseOpenDetail=openDetail;
openDetail=function(id,f){if(!can('reports'))throw new Error('Su rol solo tiene acceso al conteo de inventarios abiertos.');if(!byId(id))return;spBaseOpenDetail(id,f);var box=$('#modal .box');$('[data-act="closeModal"]',box).focus();spLoadAudit(id,box)};
async function spLoadAudit(id,box){
 try{var r=await sbc.from('sp_count_audit').select('*').eq('inventory_id',id).order('created_at',{ascending:false}).limit(200);if(r.error)throw r.error;
 if(box&&box.isConnected)box.insertAdjacentHTML('beforeend','<h3 style="margin-top:18px">Historial de correcciones y segundo conteo (últimos 200)</h3><div class="tw"><table><tr><th>Fecha</th><th>Acción</th><th>Artículo / entrada</th><th>Antes</th><th>Después</th><th>Usuario</th><th>Motivo</th></tr>'+r.data.map(function(a){return '<tr><td>'+esc(a.created_at)+'</td><td>'+esc(a.action)+'</td><td>'+esc(a.item_id||'')+(a.entry_id?' / '+esc(a.entry_id):'')+'</td><td>'+esc(a.old_qty)+'</td><td>'+esc(a.new_qty)+'</td><td>'+esc(a.actor_name)+'</td><td>'+esc(a.reason)+'</td></tr>'}).join('')+'</table></div>');
 }catch(e){if(box&&box.isConnected)fail(e)}
}
H.spCorrect=function(el){
 need('correctFinal');var id=el.dataset.id,f=el.dataset.f||'all',inv=byId(id),it=inv&&inv.items.find(function(i){return i.idDetalle===el.dataset.item});
 if(!it||!canCorrectItem(inv,it))throw new Error('El producto no está disponible para corregir.');
 function row(label,q,user,dt){var stamp=String(dt||''),parts=stamp.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/),date=parts?esc(parts[1])+' <wbr>'+esc(parts[2]):esc(stamp||'-');return '<tr><th scope="row">'+label+'</th><td class="right">'+(q??'-')+'</td><td>'+esc(user||'-')+'</td><td title="'+esc(stamp)+'">'+date+'</td></tr>'}
 openModal('<h2 id="sc_title">Corregir cantidad final</h2><p><b>'+esc(it.descripcion)+'</b><br><span class="small muted">'+esc(it.sku)+' · '+esc(id)+'</span></p>'+
  '<div class="tw correction-counts"><table><thead><tr><th>Registro</th><th class="right">Cantidad</th><th>Usuario</th><th>Fecha/Hora</th></tr></thead><tbody>'+
  row('Conteo 1',it.conteo1,it.usuarioConteo1,it.datetimeConteo1)+row('Conteo 2',it.conteo2,it.usuarioConteo2,it.datetimeConteo2)+row('Última corrección',it.conteoCorreccion,it.usuarioCorreccion,it.datetimeCorreccion)+'</tbody></table></div>'+
  '<p>Cantidad final actual: <b>'+finalQty(it)+'</b>. La nueva cantidad será la final y no cambiará los conteos anteriores.</p>'+
  '<form id="correctionForm" class="col" data-id="'+esc(id)+'" data-item="'+esc(it.idDetalle)+'" data-f="'+esc(f)+'">'+
  '<div><label for="sc_q">Cantidad corregida</label><input id="sc_q" type="number" inputmode="numeric" min="0" max="9007199254740991" step="1" required></div>'+
  '<div><label for="sc_reason">Motivo de la corrección</label><textarea id="sc_reason" rows="2" maxlength="500" required></textarea></div>'+
  '<div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-act="detailF" data-id="'+esc(id)+'" data-f="'+esc(f)+'">Cancelar</button><button class="btn p" type="submit">Guardar corrección</button></div></form>');
 var box=$('#modal .box');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','sc_title');$('#sc_q').focus();
};
H.entEdit=H.entDel=function(){throw new Error('Utilice Corregir cantidades en el detalle del inventario.')};
H.enableRecount=async function(el){var id=el.dataset.id,n=await enableRecount(id),inv=byId(id);toast('success','2do conteo autorizado',n+' artículos habilitados');if(openInventory(inv)&&inv.reconteoHabilitado){ui.invId=id;go('recount')}else render()};
H.openRecount=function(el){need('doRecount');var inv=byId(el.dataset.id);if(!openInventory(inv)||!inv.reconteoHabilitado)throw new Error('El segundo conteo todavía no está autorizado.');ui.invId=el.dataset.id;go('recount')};
H.delInv=function(el){need('deleteInv');openModal('<h2>Eliminar inventario</h2><p>Se ocultará el inventario '+esc(el.dataset.id)+' conservando la trazabilidad. Solo el administrador principal puede realizar esta acción.</p><button class="btn" data-act="closeModal">Cancelar</button> <button class="btn d" data-act="delInvOk" data-id="'+esc(el.dataset.id)+'">Confirmar eliminación</button>')};
H.delInvOk=async function(el){await deleteInventory(el.dataset.id);closeModal();render();toast('success','Inventario eliminado')};
var spBaseInvList=invListHTML;
invListHTML=function(){var html=spBaseInvList();if(session.role==='OPERARIO')html=html.replace(/<button[^>]*data-act="detail"[^>]*>[\s\S]*?<\/button>/g,'');
 if(can('deleteInv')){var temp=document.createElement('div');temp.innerHTML=html;vis().forEach(function(inv){if(inv.estado!=='PENDIENTE'){var b=temp.querySelector('[data-id="'+CSS.escape(inv.idInventario)+'"]');if(b){var card=b.closest('.card');var target=card&&card.querySelector('.row:last-child');if(target)target.insertAdjacentHTML('beforeend','<button class="btn s d" data-act="delInv" data-id="'+esc(inv.idInventario)+'">Eliminar</button>')}}});html=temp.innerHTML;}return html};
var spBaseInventories=vInventories;
vInventories=function(){var h=spBaseInventories();if(session.role==='OPERARIO')h=h.replace(/<button[^>]*data-t="FINALIZADO"[^>]*>[\s\S]*?<\/button>/g,'');return h};
var spBaseRender=render;
render=function(){
 if(spRestoring||ui.resumeError){$('#app').innerHTML=spResumeScreen();return}
 if(session&&session.role==='OPERARIO'&&['dashboard','reports','users','settings'].includes(ui.view))ui.view='inventories';
 spBaseRender();spSaveView();
};
var spBaseNavItems=navItems;
navItems=function(){return spBaseNavItems().filter(function(x){return session.role!=='OPERARIO'||x[0]==='inventories'})};
// Revalidación de visibilidad al cambiar a FINALIZADO (Realtime no emite filas ya invisibles por RLS).
var spVisibilityBusy=false;
setInterval(async function(){if(spRestoring||spVisibilityBusy||!session||session.role!=='OPERARIO'||document.hidden)return;var current=session;spVisibilityBusy=true;try{var r=await spReadQuery(sbc.from('kv').select('id').eq('col','inv'));if(r.error||session!==current)return;var ids=new Set(r.data.map(function(x){return x.id}));var before=S.inventories.length;S.inventories=S.inventories.filter(function(i){return ids.has(i.idInventario)});if(S.inventories.length!==before){save({noSync:true});refreshLive()}}catch(e){}finally{spVisibilityBusy=false}},5000);


document.addEventListener('submit',function(e){if(!['entryForm','countForm','correctionForm'].includes(e.target.id))return;var f=e.target;if(f.dataset.saving==='1'){e.preventDefault();e.stopImmediatePropagation();return}f.dataset.saving='1';var b=f.querySelector('button:not([type="button"])');if(b)b.disabled=true},true);


// Mantener el identificador de la solicitud al reintentar tras un fallo de red.
var spEntryRequest=null;
var spAddEntry=addEntry;
addEntry=async function(id,itemId,qty,ubic,notes){
 need('count');if(!SP_LOCATIONS.includes(ubic))throw new Error('Seleccione una de las cuatro ubicaciones.');
 var f=$('#entryForm'),key=JSON.stringify([id,itemId,Number(qty),ubic,notes||'']);
 if(!f)throw new Error('Abra el formulario de conteo.');
 if(f.dataset.requestKey!==key){f.dataset.requestKey=key;f.dataset.requestId=uid('en-')}
 var result=await spRpc('sp_add_entry',{p_inv:id,p_item:itemId,p_qty:Number(qty),p_location:ubic,p_notes:notes||'',p_id:f.dataset.requestId});
 await spReload();var inv=byId(id),it=inv&&inv.items.find(function(i){return i.idDetalle===itemId});
 if(result.previous_records>0)toast('warning','Conteo sumado','Había '+result.previous_total+' unidades. Nuevo total: '+result.total+'.');
 return it||{conteo1:result.total};
};
// El alta en campo conserva su pantalla, pero registra la cantidad mediante la misma RPC.
addScanned=async function(id,d){
 need('count');var inv=byId(id),q=Number(d.cantidad),sku=clean(d.sku);
 if(!inv||!sku||!Number.isSafeInteger(q)||q<0)throw new Error('SKU y cantidad entera válidos son obligatorios.');
 if(inv.items.some(function(i){return i.sku.toLowerCase()===sku.toLowerCase()}))throw new Error('Ese SKU ya existe; registre una entrada en el producto existente.');
 var loc=SP_LOCATIONS.includes(d.ubicacion)?d.ubicacion:'Bodega principal';
 var it={idDetalle:uid('det-sc-'),idInventario:id,sku:sku,barcode:clean(d.barcode)||sku,descripcion:clean(d.descripcion)||'Artículo añadido en campo',categoriaMarca:'Escaneado en Campo',ubicacion:loc,stockTeorico:0,conteo1:null,conteo2:null,datetimeConteo1:null,datetimeConteo2:null,usuarioConteo1:null,usuarioConteo2:null,notas:'Añadido vía escáner / manual en campo',requiereReconteo:false};
 await sbEnsure();var r=await sbc.from('kv').insert({col:'item',id:it.idDetalle,inv:id,data:it});if(r.error)throw new Error(r.error.message);
 await spRpc('sp_add_entry',{p_inv:id,p_item:it.idDetalle,p_qty:q,p_location:loc,p_notes:it.notas,p_id:uid('en-')});await spReload();return it;
};
finalizeInventory=async function(id){need('finalize');await spRpc('sp_finalize_inventory',{p_inv:id});await spReload();return byId(id)};
H.finalizeOk=async function(el){var inv=await finalizeInventory(el.dataset.id);closeModal();toast('success','Inventario '+inv.idInventario+' finalizado','Exactitud final '+inv.indicadorExactitud+'%.');ui.tab='FINALIZADO';go('inventories')};
// No mostrar el detalle de participantes a operarios en el formulario de alta.
var spEntryWithPermissions=openEntryModal;
openEntryModal=function(itemId){spEntryWithPermissions(itemId);if(session.role==='OPERARIO'){var warning=$('#modal .err');if(warning){var inv=byId(ui.invId),it=inv.items.find(function(i){return i.idDetalle===itemId});warning.textContent='Ya hay un conteo previo de '+(it.conteo1||0)+' unidades. La cantidad nueva se sumará; registre solo unidades adicionales.'}}};
// Evitar que eventos repetidos disparen dos escrituras administrativas simultáneas.
['delInvOk','finalizeOk','enableRecount'].forEach(function(k){var h=H[k];H[k]=async function(el,e){if(el.disabled)return;el.disabled=true;try{return await h(el,e)}finally{if(el.isConnected)el.disabled=false}}});

restoreSession();
