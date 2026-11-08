(() => {
"use strict";
const $ = (s, root=document) => root.querySelector(s);
const status=$("#house-status"), main=$("#house-main"), auth=$("#house-auth");
const list=$("#house-list"), invitations=$("#house-invitations"), detail=$("#house-detail");
let currentUser=null, selectedHouse=null, selectedRoomId=null, houseTypes=[];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const avatar=v=>v||"/default-avatar.png";
const manager=()=>["owner","admin"].includes(selectedHouse?.membership?.role);
function say(v){status.textContent=v||"";}
async function api(url,options={}){
 const r=await fetch(url,{credentials:"include",headers:{"Accept":"application/json","Content-Type":"application/json",...(options.headers||{})},...options});
 const ct=r.headers.get("content-type")||"",d=ct.includes("application/json")?await r.json():{error:await r.text()};
 if(!r.ok)throw new Error(d.error||("Request failed ("+r.status+")"));return d;
}
async function loadTypes(){
 const d=await api("/api/houses/types");houseTypes=d.houseTypes||[];
 const s=$("#house-type");
 s.innerHTML='<option value="">Choose a house type…</option>'+houseTypes.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+' — '+Number(t.cost).toLocaleString()+' ShrekCoins</option>').join("");
 s.onchange=()=>{const t=houseTypes.find(x=>String(x.id)===s.value);$("#house-type-info").textContent=t?Number(t.room_count)+" rooms · "+Number(t.tax_reduction_percent||0)+"% marketplace tax reduction":"";};
}
async function loadHouses(){
 const d=await api("/api/houses"),hs=d.houses||[];
 list.innerHTML=hs.length?hs.map(h=>'<article class="house-card"><h3>🏠 '+esc(h.name)+'</h3><p>'+esc(h.description||"No description yet.")+'</p><span class="house-tag">'+esc(h.house_type)+'</span><span class="house-tag">'+Number(h.tax_reduction_percent||0)+'% tax reduction</span><p class="house-muted">Owner: '+esc(h.owner?.display_name||h.owner?.username||"Unknown")+'</p><button class="house-button" data-open-house="'+esc(h.id)+'">Open house</button></article>').join(""):'<div class="house-empty">No houses exist yet. Build the first one!</div>';
}
async function loadInvitations(){
 const d=await api("/api/houses/invitations"),rows=d.invitations||[];$("#invite-count").textContent=rows.length;
 invitations.innerHTML=rows.length?rows.map(i=>'<article class="house-room"><strong>'+esc(i.house?.name||"House invitation")+'</strong><p class="house-muted">Invited by '+esc(i.inviter?.display_name||i.inviter?.username||"a member")+'</p><div class="house-actions"><button data-invite-action="accept" data-invite-id="'+esc(i.id)+'">Accept</button><button class="secondary" data-invite-action="decline" data-invite-id="'+esc(i.id)+'">Decline</button></div></article>').join(""):'<div class="house-empty">No pending invitations.</div>';
}
function renderMembers(data){
 const role=data.membership?.role||"member",canManage=["owner","admin"].includes(role);
 return (data.members||[]).map(m=>'<div class="house-member"><img src="'+esc(avatar(m.profile?.avatar))+'" alt=""><div class="house-member-info"><strong>'+esc(m.profile?.display_name||m.profile?.username||"Member")+'</strong><div class="house-muted">@'+esc(m.profile?.username||"unknown")+' · '+esc(m.role)+'</div></div>'+
 (canManage&&m.role!=="owner"&&m.user_id!==currentUser.id?'<div class="house-actions">'+(m.role==="admin"?'<button class="secondary" data-member-action="demote" data-user-id="'+esc(m.user_id)+'">Demote</button>':'<button data-member-action="promote" data-user-id="'+esc(m.user_id)+'">Promote</button>')+'<button class="danger" data-member-action="remove" data-user-id="'+esc(m.user_id)+'">Remove</button></div>':'')+'</div>').join("");
}
function renderRooms(data){
 const rooms=data.rooms||[];
 const canManage=["owner","admin"].includes(data.membership?.role);
 return rooms.length?rooms.map(r=>{
  const canEdit=canManage||r.owner_id===currentUser?.id;
  return '<div class="house-room-entry"><button type="button" class="house-room house-room-button '+(selectedRoomId===r.id?"active":"")+'" data-open-room="'+esc(r.id)+'"><strong>'+(r.is_private?"🔒 ":"💬 ")+esc(r.name)+'</strong><div class="house-muted">'+esc(r.description||(r.is_private?"Private room":"House chat"))+'</div></button>'+
   (canEdit?'<div class="house-room-tools"><button type="button" class="secondary" data-edit-room="'+esc(r.id)+'">Edit</button>'+(canManage?'<button type="button" class="danger" data-delete-room="'+esc(r.id)+'">Delete</button>':'')+'</div>':'')+
  '</div>';
 }).join(""):'<div class="house-empty">This House has no rooms yet.</div>';
}
async function openHouse(id){
 say("Opening House…");const d=await api("/api/houses/"+encodeURIComponent(id));selectedHouse=d;selectedRoomId=null;
 const h=d.house,role=d.membership?.role||"member",canManage=["owner","admin"].includes(role);
 const currentType=houseTypes.find(t=>Number(t.id)===Number(h.house_type_id));
 const upgradeOptions=houseTypes.filter(t=>Number(t.cost)>(Number(currentType?.cost)||0)).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+' — '+Number(t.cost-(currentType?.cost||0)).toLocaleString()+' ShrekCoins</option>').join("");
 detail.hidden=false;
 detail.innerHTML='<div class="house-actions" style="justify-content:space-between"><div><h2>🏠 '+esc(h.name)+'</h2><p>'+esc(h.description||"")+'</p><span class="house-tag">'+esc(h.house_type)+'</span><span class="house-tag">'+esc(role)+'</span><span class="house-tag">'+Number(h.tax_reduction_percent||0)+'% tax reduction</span></div><button class="secondary" data-close-detail>Close</button></div>'+
 '<div class="house-two"><section><h3>🚪 Rooms ('+(d.rooms||[]).length+')</h3><div id="house-rooms">'+renderRooms(d)+'</div>'+
 (canManage?'<form id="create-room-form" class="house-form house-panel"><h4>➕ Add a room</h4><input name="name" maxlength="40" placeholder="Room name" required><input name="description" maxlength="180" placeholder="Room description"><label class="house-check"><input type="checkbox" name="isPrivate"> Make this a private room for me</label><button class="house-button">Create room</button></form>':'')+
 '</section><section><h3>👥 Members ('+(d.members||[]).length+')</h3><div id="house-members">'+renderMembers(d)+'</div></section></div>'+
 '<section id="house-chat" class="house-panel"><h3>💬 Persistent room chat</h3><p class="house-muted">Choose a room to load its saved messages.</p><div id="house-chat-messages" class="house-chat-messages"><div class="house-empty">Select a room.</div></div><form id="house-message-form" class="house-message-form" hidden><textarea name="content" maxlength="2000" placeholder="Write a message…" required></textarea><button class="house-button">Send</button></form></section>'+
 (canManage?'<section class="house-panel"><h3>✉️ Invite someone</h3><form id="invite-form" class="house-invite"><input name="query" maxlength="60" placeholder="Search username or display name" required><button class="house-button">Search</button></form><div id="invite-search"></div></section><section class="house-panel"><h3>⚙️ House settings</h3><form id="edit-house-form" class="house-form"><input name="name" maxlength="50" required value="'+esc(h.name)+'"><textarea name="description" maxlength="300">'+esc(h.description||"")+'</textarea><button class="house-button">Save changes</button></form></section>':'')+
 (role==="owner"&&upgradeOptions?'<section class="house-panel"><h3>⬆️ Upgrade House</h3><p class="house-muted">Pay only the difference to unlock more rooms and a higher marketplace tax reduction.</p><form id="upgrade-house-form" class="house-form"><select name="houseTypeId" required>'+upgradeOptions+'</select><button class="house-button">Upgrade House</button></form></section>':'')+
 (role!=="owner"?'<div class="house-actions"><button class="danger" data-leave-house>Leave House</button></div>':'');
 detail.scrollIntoView({behavior:"smooth",block:"start"});say("");
}
async function openRoom(roomId){
 if(!selectedHouse)return;selectedRoomId=Number(roomId);
 const houseId=selectedHouse.house.id,box=$("#house-chat-messages");
 box.innerHTML='<div class="house-empty">Loading messages…</div>';$("#house-message-form").hidden=true;
 $("#house-rooms").innerHTML=renderRooms(selectedHouse);
 try{
  const d=await api("/api/houses/"+houseId+"/rooms/"+roomId+"/messages");
  const rows=d.messages||[];
  box.innerHTML=rows.length?rows.map(m=>'<article class="house-chat-message"><div class="house-chat-author">'+esc(m.author?.display_name||m.author?.username||"Member")+' <span class="house-muted">'+new Date(m.created_at).toLocaleString()+'</span></div><div>'+esc(m.content).replace(/\n/g,"<br>")+'</div></article>').join(""):'<div class="house-empty">No messages yet. Start the conversation!</div>';
  $("#house-message-form").hidden=false;box.scrollTop=box.scrollHeight;
 }catch(e){box.innerHTML='<div class="house-empty">'+esc(e.message)+'</div>';}
}
$("#create-house-form").addEventListener("submit",async e=>{
 e.preventDefault();const f=new FormData(e.currentTarget);
 try{say("Purchasing and creating your House…");const d=await api("/api/houses",{method:"POST",body:JSON.stringify({name:f.get("name"),description:f.get("description"),houseTypeId:Number(f.get("houseType"))})});e.currentTarget.reset();say("House created!");await Promise.all([loadHouses(),loadTypes()]);await openHouse(d.house.id);}
 catch(err){say(err.message);}
});
document.addEventListener("click",async e=>{
 const open=e.target.closest("[data-open-house]");if(open){try{await openHouse(open.dataset.openHouse);}catch(err){say(err.message);}return;}
 const room=e.target.closest("[data-open-room]");if(room){await openRoom(room.dataset.openRoom);return;}
 const editRoom=e.target.closest("[data-edit-room]");
 if(editRoom&&selectedHouse){
  const id=selectedHouse.house.id,roomId=Number(editRoom.dataset.editRoom);
  const current=(selectedHouse.rooms||[]).find(r=>Number(r.id)===roomId);
  if(!current)return;
  const name=prompt("Room name:",current.name);
  if(name===null)return;
  const description=prompt("Room description:",current.description||"");
  if(description===null)return;
  try{
   await api("/api/houses/"+id+"/rooms/"+roomId,{method:"PUT",body:JSON.stringify({name,description})});
   const wasSelected=selectedRoomId===roomId;
   await openHouse(id);
   if(wasSelected)await openRoom(roomId);
   say("Room updated.");
  }catch(err){say(err.message);}
  return;
 }
 const deleteRoom=e.target.closest("[data-delete-room]");
 if(deleteRoom&&selectedHouse){
  const id=selectedHouse.house.id,roomId=Number(deleteRoom.dataset.deleteRoom);
  if(!confirm("Delete this room? Its room content may also be removed."))return;
  try{
   await api("/api/houses/"+id+"/rooms/"+roomId,{method:"DELETE"});
   if(selectedRoomId===roomId)selectedRoomId=null;
   await openHouse(id);say("Room deleted.");
  }catch(err){say(err.message);}
  return;
 }
 const inv=e.target.closest("[data-invite-action]");if(inv){try{await api("/api/houses/invitations/"+inv.dataset.inviteId+"/"+inv.dataset.inviteAction,{method:"POST",body:"{}"});say(inv.dataset.inviteAction==="accept"?"Invitation accepted.":"Invitation declined.");await Promise.all([loadInvitations(),loadHouses()]);}catch(err){say(err.message);}return;}
 if(e.target.closest("[data-close-detail]")){detail.hidden=true;selectedHouse=null;selectedRoomId=null;return;}
 if(e.target.closest("[data-leave-house]")){if(!selectedHouse||!confirm("Leave this House?"))return;try{await api("/api/houses/"+selectedHouse.house.id+"/leave",{method:"DELETE"});detail.hidden=true;selectedHouse=null;say("You left the House.");await loadHouses();}catch(err){say(err.message);}return;}
 const member=e.target.closest("[data-member-action]");if(member&&selectedHouse){const id=selectedHouse.house.id,uid=member.dataset.userId,act=member.dataset.memberAction;try{if(act==="remove"){if(!confirm("Remove this member?"))return;await api("/api/houses/"+id+"/members/"+uid,{method:"DELETE"});}else if(act==="promote")await api("/api/houses/"+id+"/admins/"+uid,{method:"POST",body:"{}"});else await api("/api/houses/"+id+"/admins/"+uid,{method:"DELETE"});await openHouse(id);}catch(err){say(err.message);}return;}
 const invite=e.target.closest("[data-send-invite]");if(invite&&selectedHouse){try{await api("/api/houses/"+selectedHouse.house.id+"/invite",{method:"POST",body:JSON.stringify({userId:invite.dataset.sendInvite})});invite.disabled=true;invite.textContent="Invited";say("Invitation sent.");}catch(err){say(err.message);}}
});
document.addEventListener("submit",async e=>{
 if(e.target.id==="edit-house-form"){e.preventDefault();const f=new FormData(e.target),id=selectedHouse.house.id;try{await api("/api/houses/"+id,{method:"PUT",body:JSON.stringify({name:f.get("name"),description:f.get("description")})});say("House updated.");await openHouse(id);await loadHouses();}catch(err){say(err.message);}return;}
 if(e.target.id==="invite-form"){e.preventDefault();const q=new FormData(e.target).get("query"),box=$("#invite-search");try{const d=await api("/api/users/search?q="+encodeURIComponent(q));box.innerHTML=(d.users||[]).map(u=>'<div class="house-member"><img src="'+esc(avatar(u.avatar))+'" alt=""><div class="house-member-info"><strong>'+esc(u.display_name||u.username)+'</strong><div class="house-muted">@'+esc(u.username)+'</div></div><button class="house-button" data-send-invite="'+esc(u.id)+'">Invite</button></div>').join("")||'<p class="house-muted">No matching users.</p>';}catch(err){say(err.message);}return;}
 if(e.target.id==="upgrade-house-form"){e.preventDefault();const typeId=Number(new FormData(e.target).get("houseTypeId")),id=selectedHouse.house.id;if(!confirm("Upgrade this House? ShrekCoins will be charged."))return;try{say("Upgrading House…");await api("/api/houses/"+id+"/upgrade",{method:"POST",body:JSON.stringify({houseTypeId:typeId})});say("House upgraded!");await openHouse(id);await loadHouses();}catch(err){say(err.message);}return;}
 if(e.target.id==="create-room-form"){e.preventDefault();const f=new FormData(e.target),id=selectedHouse.house.id;try{await api("/api/houses/"+id+"/rooms",{method:"POST",body:JSON.stringify({name:f.get("name"),description:f.get("description"),isPrivate:f.get("isPrivate")==="on"})});say("Room created.");await openHouse(id);}catch(err){say(err.message);}return;}
 if(e.target.id==="house-message-form"){e.preventDefault();if(!selectedHouse||!selectedRoomId)return;const input=e.target.elements.content,content=input.value.trim();if(!content)return;const hid=selectedHouse.house.id,rid=selectedRoomId;input.disabled=true;try{await api("/api/houses/"+hid+"/rooms/"+rid+"/messages",{method:"POST",body:JSON.stringify({content})});input.value="";await openRoom(rid);}catch(err){say(err.message);}finally{input.disabled=false;input.focus();}}
});
(async()=>{try{const me=await api("/api/me");if(!me.loggedIn||!me.user){auth.hidden=false;say("Please log in to use Houses.");return;}currentUser=me.user;main.hidden=false;await Promise.all([loadTypes(),loadHouses(),loadInvitations()]);}catch(err){auth.hidden=false;say(err.message||"Could not load the House System.");}})();
})();