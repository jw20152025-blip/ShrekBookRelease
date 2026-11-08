(() => {
"use strict";
const $ = (selector, root=document) => root.querySelector(selector);
const status = $("#house-status");
const main = $("#house-main");
const auth = $("#house-auth");
const list = $("#house-list");
const invitations = $("#house-invitations");
const detail = $("#house-detail");
let currentUser = null;
let selectedHouse = null;
let houseTypes = [];
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const avatar = value => value || "/default-avatar.png";
function say(message){status.textContent=message||"";}
async function api(url, options={}) {
 const response = await fetch(url,{credentials:"include",headers:{"Accept":"application/json","Content-Type":"application/json",...(options.headers||{})},...options});
 const type=response.headers.get("content-type")||"";
 const data=type.includes("application/json")?await response.json():{error:await response.text()};
 if(!response.ok) throw new Error(data.error||("Request failed ("+response.status+")"));
 return data;
}
async function loadTypes(){
 const data=await api("/api/houses/types");
 houseTypes=data.houseTypes||[];
 const select=$("#house-type");
 select.innerHTML='<option value="">Choose a house type…</option>'+houseTypes.map(t=>'<option value="'+esc(t.name)+'">'+esc(t.name)+' — '+Number(t.cost).toLocaleString()+' ShrekCoins</option>').join("");
 select.addEventListener("change",()=>{
  const t=houseTypes.find(x=>x.name===select.value);
  $("#house-type-info").textContent=t?Number(t.room_count)+" rooms · "+Number(t.tax_reduction_percent||0)+"% marketplace tax reduction":"";
 });
 if(!houseTypes.length) $("#house-type-info").textContent="No house types are configured in the database yet.";
}
async function loadHouses(){
 const data=await api("/api/houses");
 const houses=data.houses||[];
 list.innerHTML=houses.length?houses.map(h=>'<article class="house-card"><h3>🏠 '+esc(h.name)+'</h3><p>'+esc(h.description||"No description yet.")+'</p><span class="house-tag">'+esc(h.house_type)+'</span><p class="house-muted">Owner: '+esc(h.owner?.display_name||h.owner?.username||"Unknown")+'</p><button class="house-button" data-open-house="'+esc(h.id)+'">Open house</button></article>').join(""):'<div class="house-empty">No houses exist yet. Build the first one!</div>';
}
async function loadInvitations(){
 const data=await api("/api/houses/invitations");
 const rows=data.invitations||[];
 $("#invite-count").textContent=rows.length;
 invitations.innerHTML=rows.length?rows.map(i=>'<article class="house-room"><strong>'+esc(i.house?.name||"House invitation")+'</strong><p class="house-muted">Invited by '+esc(i.inviter?.display_name||i.inviter?.username||"a member")+'</p><div class="house-actions"><button data-invite-action="accept" data-invite-id="'+i.id+'">Accept</button><button class="secondary" data-invite-action="decline" data-invite-id="'+i.id+'">Decline</button></div></article>').join(""):'<div class="house-empty">No pending invitations.</div>';
}
async function openHouse(id){
 say("Opening house…");
 const data=await api("/api/houses/"+encodeURIComponent(id));
 selectedHouse=data;
 const h=data.house, role=data.membership?.role||"member", manager=["owner","admin"].includes(role);
 detail.hidden=false;
 detail.innerHTML='<div class="house-actions" style="justify-content:space-between"><div><h2>🏠 '+esc(h.name)+'</h2><p>'+esc(h.description||"")+'</p><span class="house-tag">'+esc(h.house_type)+'</span><span class="house-tag">'+esc(role)+'</span></div><button class="secondary" data-close-detail>Close</button></div>'+
 '<div class="house-two"><section><h3>🚪 Rooms</h3><div id="house-rooms">'+(data.rooms||[]).map(r=>'<article class="house-room"><strong>'+esc(r.name)+'</strong><div class="house-muted">'+(r.room_type==="bedroom"?"Private bedroom":"Shared room")+(r.user_id?" · Assigned":"")+'</div></article>').join("")+'</div></section>'+
 '<section><h3>👥 Members ('+(data.members||[]).length+')</h3><div id="house-members">'+(data.members||[]).map(m=>'<div class="house-member"><img src="'+esc(avatar(m.profile?.avatar))+'" alt=""><div class="house-member-info"><strong>'+esc(m.profile?.display_name||m.profile?.username||"Member")+'</strong><div class="house-muted">@'+esc(m.profile?.username||"unknown")+' · '+esc(m.role)+'</div></div>'+(manager&&m.role!=="owner"&&m.user_id!==currentUser.id?'<div class="house-actions">'+(m.role==="admin"?'<button class="secondary" data-member-action="demote" data-user-id="'+esc(m.user_id)+'">Demote</button>':'<button data-member-action="promote" data-user-id="'+esc(m.user_id)+'">Promote</button>')+'<button class="danger" data-member-action="remove" data-user-id="'+esc(m.user_id)+'">Remove</button></div>':"")+'</div>').join("")+'</div></section></div>'+
 (manager?'<section class="house-panel"><h3>✉️ Invite someone</h3><form id="invite-form" class="house-invite"><input name="query" maxlength="40" placeholder="Search username or display name" required><button class="house-button">Search</button></form><div id="invite-search"></div></section><section class="house-panel"><h3>⚙️ House settings</h3><form id="edit-house-form" class="house-form"><input name="name" maxlength="50" required value="'+esc(h.name)+'"><textarea name="description" maxlength="300">'+esc(h.description||"")+'</textarea><button class="house-button">Save changes</button></form></section>':"")+
 (role!=="owner"?'<div class="house-actions"><button class="danger" data-leave-house>Leave house</button></div>':"");
 detail.scrollIntoView({behavior:"smooth",block:"start"});
 say("");
}
$("#create-house-form").addEventListener("submit",async e=>{
 e.preventDefault(); const f=new FormData(e.currentTarget);
 try{say("Creating your house…");const result=await api("/api/houses",{method:"POST",body:JSON.stringify({name:f.get("name"),description:f.get("description"),houseType:f.get("houseType")})});e.currentTarget.reset();say("House created!");await Promise.all([loadHouses(),loadTypes()]);await openHouse(result.house.id);}
 catch(err){say(err.message);}
});
document.addEventListener("click",async e=>{
 const open=e.target.closest("[data-open-house]"); if(open){try{await openHouse(open.dataset.openHouse);}catch(err){say(err.message);}return;}
 const invite=e.target.closest("[data-invite-action]");if(invite){try{await api("/api/houses/invitations/"+invite.dataset.inviteId+"/"+invite.dataset.inviteAction,{method:"POST",body:"{}"});say("Invitation "+invite.dataset.inviteAction+"ed.");await Promise.all([loadInvitations(),loadHouses()]);}catch(err){say(err.message);}return;}
 if(e.target.closest("[data-close-detail]")){detail.hidden=true;selectedHouse=null;return;}
 if(e.target.closest("[data-leave-house]")){if(!selectedHouse||!confirm("Leave this house?"))return;try{await api("/api/houses/"+selectedHouse.house.id+"/leave",{method:"DELETE"});detail.hidden=true;say("You left the house.");await loadHouses();}catch(err){say(err.message);}return;}
 const member=e.target.closest("[data-member-action]");if(member&&selectedHouse){const id=selectedHouse.house.id,uid=member.dataset.userId,action=member.dataset.memberAction;try{if(action==="remove"){if(!confirm("Remove this member?"))return;await api("/api/houses/"+id+"/members/"+uid,{method:"DELETE"});}else if(action==="promote")await api("/api/houses/"+id+"/admins/"+uid,{method:"POST",body:"{}"});else await api("/api/houses/"+id+"/admins/"+uid,{method:"DELETE"});await openHouse(id);}catch(err){say(err.message);}return;}
});
document.addEventListener("submit",async e=>{
 if(e.target.id==="edit-house-form"){e.preventDefault();const f=new FormData(e.target);try{await api("/api/houses/"+selectedHouse.house.id,{method:"PUT",body:JSON.stringify({name:f.get("name"),description:f.get("description")})});say("House updated.");await openHouse(selectedHouse.house.id);await loadHouses();}catch(err){say(err.message);}return;}
 if(e.target.id==="invite-form"){e.preventDefault();const q=new FormData(e.target).get("query");const box=$("#invite-search");try{const data=await api("/api/users/search?q="+encodeURIComponent(q));box.innerHTML=(data.users||[]).map(u=>'<div class="house-member"><img src="'+esc(avatar(u.avatar))+'" alt=""><div class="house-member-info"><strong>'+esc(u.display_name||u.username)+'</strong><div class="house-muted">@'+esc(u.username)+'</div></div><button class="house-button" data-send-invite="'+esc(u.id)+'">Invite</button></div>').join("")||'<p class="house-muted">No matching users.</p>';}catch(err){say(err.message);}return;}
});
document.addEventListener("click",async e=>{
 const button=e.target.closest("[data-send-invite]");if(!button||!selectedHouse)return;
 try{await api("/api/houses/"+selectedHouse.house.id+"/invite",{method:"POST",body:JSON.stringify({userId:button.dataset.sendInvite})});button.disabled=true;button.textContent="Invited";say("Invitation sent.");}catch(err){say(err.message);}
});
(async()=>{
 try{const me=await api("/api/me");if(!me.loggedIn||!me.user){auth.hidden=false;say("Please log in to use Houses.");return;}currentUser=me.user;main.hidden=false;await Promise.all([loadTypes(),loadHouses(),loadInvitations()]);}
 catch(err){auth.hidden=false;say(err.message||"Could not load the House System.");}
})();
})();