(() => {
  const SESSION_KEY = 'sjops.p2.session';
  const phoneQuery = window.matchMedia('(max-width: 760px)');

  // Prototype credential routing only. The production backend should validate USERS.credential_hash
  // and return the user identity/role; raw credentials should never be stored in this file.
  const PREVIEW_ACCESS = {
    '1014': {user_id:'ANGEL', full_name:'Angel', role:'ADMIN'},
    '2468': {user_id:'MANAGER-PREVIEW', full_name:'Manager Preview', role:'MANAGER'},
    '1357': {user_id:'WAREHOUSE-PREVIEW', full_name:'Warehouse Worker', role:'OPERATOR'}
  };

  const roleLabel = role => role === 'ADMIN' ? 'Operations Admin' : role === 'MANAGER' ? 'Operations Manager' : 'Warehouse Operator';
  const roleIsAdmin = role => ['ADMIN','MANAGER'].includes(String(role || '').toUpperCase());

  function loadSession(){
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      return saved?.authenticated ? saved : null;
    } catch (_e) { return null; }
  }
  function saveSession(user){
    const session = {...user, authenticated:true, signed_in_at:new Date().toISOString()};
    sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
    return session;
  }
  function clearSession(){ sessionStorage.removeItem(SESSION_KEY); }

  let session = loadSession();
  window.SAN_JOSE_SESSION = session;
  window.SAN_JOSE_USER_ROLE = session?.role || '';

  function buildLogin(){
    if(document.getElementById('p2LoginScreen')) return;
    const login = document.createElement('section');
    login.id='p2LoginScreen';login.className='p2-login-screen';login.setAttribute('aria-label','San Jose Operations sign in');
    login.innerHTML=`<div class="p2-login-shell">
      <div class="p2-login-main">
        <section class="p2-login-brand">
          <div class="p2-login-brandmark"><img src="./logo_San_Jose.png" alt=""><div><strong>San Jose Produce & Imports</strong><span>Internal Operations System</span></div></div>
          <h1 class="p2-login-title">Operations<br>Center</h1>
          <p class="p2-login-subtitle">Inventory, receiving, shipping and warehouse control in one operational workspace.</p>
        </section>
        <form id="p2LoginForm" class="p2-login-card" autocomplete="off">
          <span class="p2-login-eyebrow">SECURE ACCESS</span>
          <h2>Enter your 4-digit code</h2>
          <p>Your code identifies your account and opens the correct workspace automatically.</p>
          <div class="p2-pin-wrap" id="p2PinWrap">
            <input id="p2PinInput" class="p2-pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="Four digit access code">
            <div class="p2-pin-slots" aria-hidden="true"><span class="p2-pin-slot"></span><span class="p2-pin-slot"></span><span class="p2-pin-slot"></span><span class="p2-pin-slot"></span></div>
          </div>
          <p id="p2LoginError" class="p2-login-error" aria-live="polite"></p>
          <button id="p2LoginButton" class="p2-login-button" type="submit">Unlock workspace</button>
          <div class="p2-login-hint"><i></i><span>Role-based access · Admin, Manager and Warehouse workspaces are separated automatically.</span></div>
        </form>
      </div>
      <footer class="p2-login-footer"><p>San Jose Produce & Imports · Internal operating system for inventory movement, order fulfillment and warehouse control.</p><span>AUTHORIZED PERSONNEL ONLY</span></footer>
    </div>`;
    document.body.appendChild(login);
    const input=document.getElementById('p2PinInput');
    const form=document.getElementById('p2LoginForm');
    const wrap=document.getElementById('p2PinWrap');
    wrap.addEventListener('click',()=>input.focus());
    input.addEventListener('input',()=>{
      input.value=input.value.replace(/\D/g,'').slice(0,4);
      paintPin(input.value);
      document.getElementById('p2LoginError').textContent='';
      if(input.value.length===4) setTimeout(()=>form.requestSubmit(),100);
    });
    input.addEventListener('focus',()=>paintPin(input.value));
    input.addEventListener('blur',()=>paintPin(input.value,false));
    form.addEventListener('submit',e=>{e.preventDefault();completeLogin(input.value);});
  }

  function paintPin(value,focused=true){
    document.querySelectorAll('.p2-pin-slot').forEach((slot,i)=>{
      slot.classList.toggle('filled',i<value.length);
      slot.classList.toggle('active',focused && i===Math.min(value.length,3) && value.length<4);
    });
  }

  function completeLogin(pin){
    const user=PREVIEW_ACCESS[String(pin||'')];
    const card=document.querySelector('.p2-login-card');
    const error=document.getElementById('p2LoginError');
    const input=document.getElementById('p2PinInput');
    if(!user){
      error.textContent='That code does not match an active user.';
      card?.classList.remove('shake');void card?.offsetWidth;card?.classList.add('shake');
      if(input){input.value='';paintPin('');input.focus();}
      return;
    }
    card?.classList.add('unlocking');
    session=saveSession(user);window.SAN_JOSE_SESSION=session;window.SAN_JOSE_USER_ROLE=session.role;
    setTimeout(()=>enterWorkspace(),180);
  }

  function applyIdentity(){
    if(!session)return;
    const signed=document.querySelector('.signed-user');
    if(signed){
      const avatar=signed.querySelector('.avatar');const strong=signed.querySelector('strong');const span=signed.querySelector('span');
      if(avatar)avatar.textContent=(session.full_name||'U').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
      if(strong)strong.textContent=session.full_name;
      if(span)span.textContent=roleLabel(session.role);
      let out=signed.parentElement?.querySelector('.p2-signout-btn');
      if(!out && signed.parentElement){out=document.createElement('button');out.type='button';out.className='p2-signout-btn';out.textContent='Sign out';out.addEventListener('click',signOut);signed.parentElement.appendChild(out);}
    }
    document.body.classList.toggle('p2-role-admin',session.role==='ADMIN');
    document.body.classList.toggle('p2-role-manager',session.role==='MANAGER');
    document.body.classList.toggle('p2-role-worker',!roleIsAdmin(session.role));
  }

  function applyDesktopPermissions(){
    if(!session || phoneQuery.matches)return;
    const workerAllowed=new Set(['overview','receiving','shipping','inventory','packing','scanner']);
    document.querySelectorAll('[data-nav]').forEach(btn=>{
      const allowed=roleIsAdmin(session.role) || workerAllowed.has(btn.dataset.nav);
      btn.closest('.nav-section')?.classList.toggle('p2-role-hidden-section',false);
      btn.hidden=!allowed;
    });
    document.querySelectorAll('.nav-section').forEach(section=>{
      const visible=[...section.querySelectorAll('[data-nav]')].some(b=>!b.hidden);
      section.hidden=!visible;
    });
    const create=document.getElementById('quickCreate');if(create)create.hidden=!roleIsAdmin(session.role);
  }

  function installMobileAccount(){
    if(!session || !phoneQuery.matches)return;
    const header=document.querySelector('.mobile-worker-header');if(!header)return;
    if(header.querySelector('.p2-mobile-account'))return;
    const btn=document.createElement('button');btn.type='button';btn.className='p2-mobile-account';btn.textContent=(session.full_name||'U').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();btn.setAttribute('aria-label','Account');
    btn.addEventListener('click',()=>openAccountSheet());header.appendChild(btn);
  }

  function openAccountSheet(){
    if(typeof openDrawer!=='function' || !session)return;
    openDrawer('ACCOUNT',session.full_name,`<div class="p2-account-sheet"><div class="p2-account-identity"><span>SIGNED IN</span><strong>${session.full_name}</strong><small>${roleLabel(session.role)} · ${session.user_id}</small></div><button type="button" class="p2-account-signout" id="p2DrawerSignOut">Sign out</button></div>`);
    document.getElementById('p2DrawerSignOut')?.addEventListener('click',signOut);
  }

  function enforceRoleHome(){
    if(!session)return;
    if(!roleIsAdmin(session.role) && ['purchase','sales','replenishment','products','parties','analytics','admin'].includes(state.page)) state.page='overview';
  }

  const existingRenderNav=typeof renderNav==='function'?renderNav:null;
  if(existingRenderNav){
    renderNav=function(){existingRenderNav();applyIdentity();applyDesktopPermissions();};
  }
  const existingRenderPage=typeof renderPage==='function'?renderPage:null;
  if(existingRenderPage){
    renderPage=function(){enforceRoleHome();existingRenderPage();applyIdentity();applyDesktopPermissions();requestAnimationFrame(installMobileAccount);};
  }

  function enterWorkspace(){
    document.body.classList.remove('p2-auth-locked');
    document.getElementById('p2LoginScreen')?.remove();
    applyIdentity();
    enforceRoleHome();
    if(typeof renderNav==='function')renderNav();
    if(typeof renderPage==='function')renderPage();
    setTimeout(installMobileAccount,40);
  }

  function signOut(){
    clearSession();session=null;window.SAN_JOSE_SESSION=null;window.SAN_JOSE_USER_ROLE='';
    if(typeof closeDrawer==='function')closeDrawer();
    state.page='overview';location.hash='';
    document.body.className=document.body.className.replace(/\bp2-role-(admin|manager|worker)\b/g,'').trim();
    document.querySelector('.mobile-worker-header')?.remove();document.querySelector('.mobile-bottom-nav')?.remove();
    buildLogin();document.body.classList.add('p2-auth-locked');setTimeout(()=>document.getElementById('p2PinInput')?.focus(),70);
  }

  window.SanJoseP2Auth={signOut,getSession:()=>session};
  buildLogin();
  if(session){enterWorkspace();}
  else{document.body.classList.add('p2-auth-locked');setTimeout(()=>document.getElementById('p2PinInput')?.focus(),120);}
})();
