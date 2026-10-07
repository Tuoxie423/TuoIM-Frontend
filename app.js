// ===== 配置 =====
const HOST = location.protocol === 'file:' ? 'localhost' : location.hostname;
const API = `http://${HOST}:8080/api`;
const WS = `ws://${HOST}:8081/ws`;

let token = localStorage.getItem('token') || '';
let ws = null;
let heartbeatTimer = null;
let currentChat = null;   // 当前聊天对象 {type:'friend'|'group', id, name}
let friends = [];         // 好友列表
let groups = [];          // 群列表
let messages = {};        // 消息缓存，key: `${type}:${id}`
let roomMap = {};         // room_id -> {type, id, name}（用于收消息时关联）
let userMap = {};         // uid -> name（用于群聊显示发送者昵称）

// ===== DOM =====
const $ = (id) => document.getElementById(id);

// ===== API 封装 =====
async function api(path, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
    });
    return res.json();
}

// ===== 登录 / 注册 =====
let isRegister = false;

$('toggle-auth').addEventListener('click', () => {
    isRegister = !isRegister;
    $('auth-title').textContent = isRegister ? '注册' : '登录';
    $('auth-btn').textContent = isRegister ? '注册' : '登录';
    $('toggle-auth').textContent = isRegister ? '已有账号？去登录' : '没有账号？去注册';
    $('name-input').classList.toggle('hidden', !isRegister);
});

$('auth-btn').addEventListener('click', async () => {
    const phone = $('phone-input').value.trim();
    const password = $('password-input').value;
    if (!phone || !password) return alert('手机号和密码不能为空');

    const path = isRegister ? '/register' : '/login';
    const body = isRegister
        ? { name: $('name-input').value.trim() || '用户', password, phone }
        : { phone, password };

    const data = await api(path, 'POST', body);
    if (data.code === 0) {
        if (isRegister) {
            alert('注册成功，请登录');
            isRegister = false;
            $('auth-title').textContent = '登录';
            $('auth-btn').textContent = '登录';
            $('toggle-auth').textContent = '没有账号？去注册';
            $('name-input').classList.add('hidden');
            $('password-input').value = '';
        } else {
            token = data.data.token;
            localStorage.setItem('token', token);
            enterChat();
        }
    } else {
        alert(data.msg || '操作失败');
    }
});

// ===== 进入聊天页 =====
function enterChat() {
    $('auth-page').classList.add('hidden');
    $('chat-page').classList.remove('hidden');
    // 重置状态（换账号时清掉上一个账号的数据）
    currentChat = null;
    friends = [];
    groups = [];
    messages = {};
    roomMap = {};
    userMap = {};
    connectWS();
    loadFriends();
    loadGroups();
    loadApplyList();
}

// ===== WebSocket =====
function connectWS() {
    ws = new WebSocket(`${WS}?token=${token}`);

    ws.onopen = () => {
        console.log('✅ WebSocket 已连接');
        heartbeatTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 30000);
    };

    ws.onmessage = (e) => {
        console.log('📩 收到消息:', e.data);
        try {
            onReceive(JSON.parse(e.data));
        } catch (err) {}
    };

    ws.onerror = (e) => console.log('❌ WebSocket 错误:', e);

    ws.onclose = () => {
        console.log('🔌 WebSocket 已关闭');
        clearInterval(heartbeatTimer);
    };
}

// 收到新消息：根据 room_id 关联到聊天对象
function onReceive(msg) {
    const info = roomMap[msg.room_id];
    if (!info) return; // 未知房间（可能还没打开过），忽略
    const key = info.type + ':' + info.id;
    if (!messages[key]) messages[key] = [];
    messages[key].push(msg);
    // 如果是当前聊天对象，刷新显示
    if (currentChat && (currentChat.type + ':' + currentChat.id) === key) {
        renderMessages();
    }
}

function chatKey(chat) {
    return chat.type + ':' + chat.id;
}

// ===== 好友 =====
async function loadFriends() {
    const data = await api('/friend/list');
    if (data.code !== 0) return;
    friends = data.data;
    friends.forEach((f) => { userMap[f.uid] = f.name || ('用户' + f.uid); });
    renderFriends();
}

function renderFriends() {
    const list = $('friend-list');
    list.innerHTML = '';
    friends.forEach((f) => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        const name = f.name || ('用户' + f.uid);
        const status = f.online ? '在线' : '离线';
        div.innerHTML = `
            ${avatarHTML(f.avatar, name)}
            <div class="friend-main">
                <span class="name">${name}</span>
                <span class="status-text ${f.online ? 'online' : 'offline'}">${status}</span>
            </div>
        `;
        div.onclick = () => openChat(f);
        list.appendChild(div);
    });
}

// ===== 群聊 =====
async function loadGroups() {
    const data = await api('/group/list');
    if (data.code !== 0) return;
    groups = data.data;
    groups.forEach((g) => {
        roomMap[g.room_id] = { type: 'group', id: g.room_id, name: g.name };
    });
    renderGroups();
}

function renderGroups() {
    const list = $('group-list');
    list.innerHTML = '';
    if (groups.length === 0) {
        list.innerHTML = '<div class="empty-tip">暂无群聊</div>';
        return;
    }
    groups.forEach((g) => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
            ${avatarHTML(g.avatar, g.name)}
            <div class="friend-main"><span class="name">${g.name}</span></div>
        `;
        div.onclick = () => openGroupChat(g);
        list.appendChild(div);
    });
}

async function openGroupChat(group) {
    currentChat = { type: 'group', id: group.room_id, name: group.name };
    $('chat-header-name').textContent = `${group.name}（群聊）`;
    $('group-members-btn').classList.remove('hidden');  // 群聊显示成员按钮
    $('chat-page').classList.add('show-chat');
    $('message-input').disabled = false;
    $('send-btn').disabled = false;
    const key = chatKey(currentChat);
    messages[key] = [];

    // 加载群成员（填充昵称映射）
    const membersData = await api(`/group/members?room_id=${group.room_id}`);
    if (membersData.code === 0) {
        (membersData.data || []).forEach((m) => { userMap[m.uid] = m.name || ('用户' + m.uid); });
    }

    // 查历史消息
    const history = await api(`/chat/history?room_id=${group.room_id}&limit=50`);
    if (history.code === 0) {
        messages[key] = (history.data.list || []).reverse();
    }
    renderMessages();
}

// ===== 搜索 + 申请 =====
$('search-btn').addEventListener('click', searchUser);

async function searchUser() {
    const phone = $('search-input').value.trim();
    if (!phone) return alert('请输入手机号');
    const data = await api(`/users/search?phone=${phone}`);
    const box = $('search-result');
    box.innerHTML = '';
    if (data.code !== 0) {
        box.innerHTML = `<div class="search-item">${data.msg || '未找到'}</div>`;
        return;
    }
    const u = data.data;
    const div = document.createElement('div');
    div.className = 'search-item';
    div.innerHTML = `<span class="name">${u.name} (${u.phone})</span>`;
    const btn = document.createElement('button');
    btn.className = 'item-btn';
    btn.textContent = '加好友';
    btn.onclick = () => applyFriend(u.ID);
    div.appendChild(btn);
    box.appendChild(div);
}

async function applyFriend(uid) {
    const data = await api('/friend/apply', 'POST', { to_user_id: uid, msg: '加个好友' });
    alert(data.msg || '操作失败');
    $('search-result').innerHTML = '';
}

// ===== 申请列表 =====
$('apply-list-title').addEventListener('click', () => {
    $('apply-list').classList.toggle('hidden');
    loadApplyList();
});

async function loadApplyList() {
    const data = await api('/friend/applyList');
    if (data.code !== 0) return;
    const list = data.data;
    $('unread-badge').textContent = list.filter((a) => a.status === 1).length || '';
    const box = $('apply-list');
    box.innerHTML = '';
    list.forEach((a) => {
        const div = document.createElement('div');
        div.className = 'apply-item';
        div.innerHTML = `<span class="name">${a.name} 申请加你</span>`;
        if (a.status === 1) {
            const agree = document.createElement('button');
            agree.className = 'item-btn';
            agree.textContent = '同意';
            agree.onclick = () => handleApply(a.uid, true);
            const reject = document.createElement('button');
            reject.className = 'item-btn gray';
            reject.textContent = '拒绝';
            reject.onclick = () => handleApply(a.uid, false);
            div.appendChild(agree);
            div.appendChild(reject);
        } else {
            const s = document.createElement('span');
            s.textContent = a.status === 2 ? '已同意' : '已拒绝';
            s.style.fontSize = '12px';
            div.appendChild(s);
        }
        box.appendChild(div);
    });
}

async function handleApply(applyUID, agree) {
    const path = agree ? '/friend/agree' : '/friend/reject';
    const data = await api(path, 'POST', { apply_uid: applyUID });
    if (data.code === 0) {
        loadApplyList();
        loadFriends();
    } else {
        alert(data.msg || '操作失败');
    }
}

// ===== 聊天 =====
async function openChat(friend) {
    currentChat = { type: 'friend', id: friend.uid, name: friend.name || ('用户' + friend.uid) };
    $('chat-header-name').textContent = `与 ${currentChat.name} 聊天`;
    $('group-members-btn').classList.add('hidden');  // 单聊隐藏成员按钮
    $('chat-page').classList.add('show-chat');
    $('message-input').disabled = false;
    $('send-btn').disabled = false;
    const key = chatKey(currentChat);
    messages[key] = [];

    // ① 获取/创建房间，拿到 room_id
    const roomData = await api('/room/get_or_create', 'POST', { to_user_id: friend.uid });
    if (roomData.code === 0) {
        const roomID = roomData.data.room_id;
        roomMap[roomID] = currentChat; // 记录 room -> chat
        // ② 查历史消息
        const history = await api(`/chat/history?room_id=${roomID}&limit=50`);
        if (history.code === 0) {
            messages[key] = (history.data.list || []).reverse();
        }
    }
    renderMessages();
}

function renderMessages() {
    const list = $('message-list');
    list.innerHTML = '';
    const key = currentChat ? chatKey(currentChat) : '';
    const msgs = messages[key] || [];
    msgs.forEach((m) => {
        const mine = m.from_user_id === myUID();
        const div = document.createElement('div');
        div.className = 'msg ' + (mine ? 'mine' : 'other');
        const time = m.CreatedAt
            ? new Date(m.CreatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            : '';
        // 群聊 + 别人发的 → 显示发送者昵称
        const sender = (!mine && currentChat && currentChat.type === 'group')
            ? `<span class="msg-sender">${userMap[m.from_user_id] || ('用户' + m.from_user_id)}</span>`
            : '';
        // 图片消息（type=2）渲染 img，否则渲染文本
        let content;
        if (m.type === 2) {
            content = `<img src="${fullURL(m.content)}" class="msg-image" onclick="window.open('${fullURL(m.content)}')">`;
        } else {
            content = m.content;
        }
        div.innerHTML = `${sender}${content}<span class="msg-time">${time}</span>`;
        list.appendChild(div);
    });
    list.scrollTop = list.scrollHeight;
}

// 把相对路径转成完整 URL（图片等）
function fullURL(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `http://${HOST}:8080${path}`;
}

// 生成头像 HTML：有头像显示图片，没有显示名字首字母占位
function avatarHTML(avatar, name) {
    if (avatar) {
        return `<img src="${fullURL(avatar)}" class="avatar">`;
    }
    const initial = (name || '?').charAt(0).toUpperCase();
    return `<span class="avatar avatar-default">${initial}</span>`;
}

// 从 token 解析自己的 uid
function myUID() {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(atob(payload)).user_id;
    } catch (err) {
        return 0;
    }
}

// ===== 发送消息 =====
$('send-btn').addEventListener('click', sendMessage);
$('message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const content = $('message-input').value.trim();
    if (!content || !currentChat) return;

    let data;
    if (currentChat.type === 'friend') {
        data = await api('/chat/send', 'POST', { to_user_id: currentChat.id, content, type: 1 });
    } else {
        data = await api('/group/send', 'POST', { room_id: currentChat.id, content, type: 1 });
    }

    if (data.code === 0) {
        const key = chatKey(currentChat);
        if (!messages[key]) messages[key] = [];
        messages[key].push({ from_user_id: myUID(), content, type: 1, CreatedAt: new Date().toISOString() });
        $('message-input').value = '';
        renderMessages();
    } else {
        alert(data.msg || '发送失败');
    }
}

// ===== 建群 =====
$('create-group-btn').addEventListener('click', () => {
    $('create-group-modal').classList.remove('hidden');
});
$('close-group-btn').addEventListener('click', () => {
    $('create-group-modal').classList.add('hidden');
});
$('confirm-create-group-btn').addEventListener('click', createGroup);

async function createGroup() {
    const name = $('group-name-input').value.trim();
    if (!name) return alert('请输入群名称');
    const data = await api('/group/create', 'POST', { name });
    if (data.code === 0) {
        alert('建群成功');
        $('create-group-modal').classList.add('hidden');
        $('group-name-input').value = '';
        loadGroups();
    } else {
        alert(data.msg || '建群失败');
    }
}

// ===== 启动 =====
(async function init() {
    if (token) {
        const data = await api('/users/info');
        if (data.code === 0) {
            enterChat();
            return;
        }
        localStorage.removeItem('token');
        token = '';
    }
    $('auth-page').classList.remove('hidden');
    $('chat-page').classList.add('hidden');
})();

// ===== 个人中心 =====
$('profile-btn').addEventListener('click', openProfile);
$('close-profile-btn').addEventListener('click', closeProfile);
$('logout-btn').addEventListener('click', logout);

async function openProfile() {
    const data = await api('/users/info');
    if (data.code === 0) {
        const u = data.data;
        const sex = u.sex === 1 ? '男' : u.sex === 2 ? '女' : '未知';
        $('profile-info').innerHTML = `
            <div class="profile-avatar">${avatarHTML(u.avatar, u.name)}</div>
            <p><strong>昵称：</strong>${u.name || '-'}</p>
            <p><strong>手机号：</strong>${u.phone || '-'}</p>
            <p><strong>用户ID：</strong>${u.ID}</p>
            <p><strong>性别：</strong>${sex}</p>
        `;
        $('edit-name').value = u.name || '';
        $('edit-sex').value = u.sex || 0;
    } else {
        $('profile-info').innerHTML = '<p>获取用户信息失败</p>';
    }
    $('profile-modal').classList.remove('hidden');
}

$('save-profile-btn').addEventListener('click', saveProfile);

async function saveProfile() {
    const name = $('edit-name').value.trim();
    const sex = parseInt($('edit-sex').value);
    const data = await api('/users/info', 'PUT', { name, sex });
    if (data.code === 0) {
        alert(data.msg || '资料已更新');
        openProfile();
    } else {
        alert(data.msg || '更新失败');
    }
}

function closeProfile() {
    $('profile-modal').classList.add('hidden');
}

function logout() {
    if (ws) {
        clearInterval(heartbeatTimer);
        ws.close();
    }
    localStorage.removeItem('token');
    token = '';
    currentChat = null;
    friends = [];
    groups = [];
    messages = {};
    roomMap = {};
    userMap = {};
    $('profile-modal').classList.add('hidden');
    $('chat-page').classList.add('hidden');
    $('auth-page').classList.remove('hidden');
    $('phone-input').value = '';
    $('password-input').value = '';
}

// ===== 返回（移动端） =====
$('back-btn').addEventListener('click', () => {
    $('chat-page').classList.remove('show-chat');
});

// ===== Emoji 表情 =====
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😜','🤔','😎','😭','😅','😳','🙄','😴','🥰','😇','🤗','🤩','🥳','😡','🤬','👍','👎','🙏','👏','💪','🤝','❤️','🎉','🎂','🌹','☕','🍺','🐶','🐱','🔥','✨','🌙','☀️'];

function renderEmojiPanel() {
    const panel = $('emoji-panel');
    panel.innerHTML = '';
    EMOJIS.forEach((e) => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        span.textContent = e;
        span.onclick = () => insertEmoji(e);
        panel.appendChild(span);
    });
}

function insertEmoji(emoji) {
    const input = $('message-input');
    input.value += emoji;
    input.focus();
}

$('emoji-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('emoji-panel').classList.toggle('hidden');
});

// 点击输入框时关闭表情面板
$('message-input').addEventListener('click', () => {
    $('emoji-panel').classList.add('hidden');
});

renderEmojiPanel();

// ===== 图片消息 =====
$('image-btn').addEventListener('click', () => {
    $('image-input').click();
});

$('image-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // 上传图片
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API}/file/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,   // FormData 不要手动设 Content-Type
    });
    const data = await res.json();
    if (data.code === 0) {
        await sendImageMessage(data.data.url);
    } else {
        alert(data.msg || '上传失败');
    }
    e.target.value = '';  // 清空，允许重复选同一张图
});

async function sendImageMessage(url) {
    if (!currentChat) return;
    let data;
    if (currentChat.type === 'friend') {
        data = await api('/chat/send', 'POST', { to_user_id: currentChat.id, content: url, type: 2 });
    } else {
        data = await api('/group/send', 'POST', { room_id: currentChat.id, content: url, type: 2 });
    }
    if (data.code === 0) {
        const key = chatKey(currentChat);
        if (!messages[key]) messages[key] = [];
        messages[key].push({ from_user_id: myUID(), content: url, type: 2, CreatedAt: new Date().toISOString() });
        renderMessages();
    } else {
        alert(data.msg || '发送失败');
    }
}

// ===== 群成员管理 =====
let currentGroupRole = 0; // 当前用户在当前群的角色

$('group-members-btn').addEventListener('click', openGroupMembers);
$('close-group-members-btn').addEventListener('click', () => {
    $('group-members-modal').classList.add('hidden');
});
$('add-member-btn').addEventListener('click', openAddMember);
$('close-add-member-btn').addEventListener('click', () => {
    $('add-member-modal').classList.add('hidden');
});

async function openGroupMembers() {
    if (!currentChat || currentChat.type !== 'group') return;
    const data = await api(`/group/members?room_id=${currentChat.id}`);
    if (data.code !== 0) return alert(data.msg || '获取失败');
    const members = data.data;
    // 找到当前用户的角色
    const me = members.find((m) => m.uid === myUID());
    currentGroupRole = me ? me.role : 0;
    // 填充昵称映射
    members.forEach((m) => { userMap[m.uid] = m.name || ('用户' + m.uid); });
    renderGroupMembers(members);
    // 群主/管理员可见「加人」「更换群头像」按钮
    $('add-member-btn').classList.toggle('hidden', !(currentGroupRole === 1 || currentGroupRole === 2));
    $('upload-group-avatar-btn').classList.toggle('hidden', !(currentGroupRole === 1 || currentGroupRole === 2));
    $('group-members-modal').classList.remove('hidden');
}

function renderGroupMembers(members) {
    const list = $('group-members-list');
    list.innerHTML = '';
    members.forEach((m) => {
        const div = document.createElement('div');
        div.className = 'member-item';
        const roleName = m.role === 1 ? '群主' : m.role === 2 ? '管理员' : '';
        div.innerHTML = `${avatarHTML(m.avatar, m.name)}<span class="name">${m.name || ('用户' + m.uid)}${roleName ? ` <small>(${roleName})</small>` : ''}</span>`;
        // 群主/管理员能踢人（不能踢自己、不能踢群主）
        const canKick = (currentGroupRole === 1 || currentGroupRole === 2) && m.uid !== myUID() && m.role !== 1;
        if (canKick) {
            const btn = document.createElement('button');
            btn.className = 'item-btn gray';
            btn.textContent = '踢出';
            btn.onclick = () => removeMember(m.uid);
            div.appendChild(btn);
        }
        list.appendChild(div);
    });
}

async function removeMember(targetUID) {
    const data = await api('/group/remove', 'POST', { room_id: currentChat.id, target_uid: targetUID });
    if (data.code === 0) {
        alert('已移除');
        openGroupMembers();
    } else {
        alert(data.msg || '移除失败');
    }
}

function openAddMember() {
    const list = $('add-member-friend-list');
    list.innerHTML = '';
    if (friends.length === 0) {
        list.innerHTML = '<div class="empty-tip">暂无好友可添加</div>';
    }
    friends.forEach((f) => {
        const div = document.createElement('div');
        div.className = 'member-item';
        div.innerHTML = `<span class="name">${f.name || ('用户' + f.uid)}</span>`;
        const btn = document.createElement('button');
        btn.className = 'item-btn';
        btn.textContent = '添加';
        btn.onclick = () => addMember(f.uid);
        div.appendChild(btn);
        list.appendChild(div);
    });
    $('add-member-modal').classList.remove('hidden');
}

async function addMember(targetUID) {
    const data = await api('/group/add', 'POST', { room_id: currentChat.id, target_uid: targetUID });
    if (data.code === 0) {
        alert('已添加');
        $('add-member-modal').classList.add('hidden');
    } else {
        alert(data.msg || '添加失败');
    }
}

// ===== 头像上传 =====
// 用户头像
$('upload-avatar-btn').addEventListener('click', () => $('avatar-input').click());

$('avatar-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadFile(file);
    if (!url) return;
    const upd = await api('/users/info', 'PUT', { avatar: url });
    if (upd.code === 0) {
        alert('头像已更新');
        openProfile();
    } else {
        alert(upd.msg || '更新失败');
    }
    e.target.value = '';
});

// 群头像
$('upload-group-avatar-btn').addEventListener('click', () => $('group-avatar-input').click());

$('group-avatar-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadFile(file);
    if (!url) return;
    const upd = await api('/group/update', 'POST', { room_id: currentChat.id, avatar: url });
    if (upd.code === 0) {
        alert('群头像已更新');
        loadGroups();
    } else {
        alert(upd.msg || '更新失败');
    }
    e.target.value = '';
});

// 通用：上传文件，返回 URL（失败返回 null）
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API}/file/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
    });
    const data = await res.json();
    if (data.code === 0) {
        return data.data.url;
    }
    alert(data.msg || '上传失败');
    return null;
}
