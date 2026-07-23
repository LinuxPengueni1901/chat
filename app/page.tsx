'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface FriendRequest {
  id: string
  sender_name: string
  receiver_name: string
  status: 'pending' | 'accepted' | 'rejected'
}

interface Group {
  id: string
  name: string
  created_by: string
}

interface Message {
  id: string
  sender_name: string
  content: string
  created_at: string
}

export default function ChatApp() {
  // Auth Durumları
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userName, setUserName] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [showRedirectToLogin, setShowRedirectToLogin] = useState(false)

  // Oturum Açan Kullanıcı Bilgileri
  const [isJoined, setIsJoined] = useState(false)
  const [myAvatar, setMyAvatar] = useState<string | null>(null)
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)

  // Sekme Değişimi & Chat Durumları
  const [activeTab, setActiveTab] = useState<'dms' | 'groups' | 'requests'>('dms')
  const [friends, setFriends] = useState<string[]>([])
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([])
  const [friendInput, setFriendInput] = useState('')
  const [activeDM, setActiveDM] = useState<string | null>(null)

  const [groups, setGroups] = useState<Group[]>([])
  const [activeGroup, setActiveGroup] = useState<Group | null>(null)
  const [groupNameInput, setGroupNameInput] = useState('')
  const [selectedFriendToInvite, setSelectedFriendToInvite] = useState('')

  // GRUP ÜYELERİ MODALI VE İÇERİK KONTROLÜ
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const [showMembersModal, setShowMembersModal] = useState(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // --- AUTH İŞLEMLERİ ---

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setShowRedirectToLogin(false)

    const cleanEmail = email.trim().toLowerCase()
    const cleanUserName = userName.trim()

    if (!cleanEmail || !password.trim() || !cleanUserName) {
      setAuthError('Lütfen tüm alanları doldurun!')
      return
    }

    try {
      const { data: existingUser, error: selectError } = await supabase
        .from('users')
        .select('email')
        .eq('email', cleanEmail)

      if (selectError) throw selectError

      if (existingUser && existingUser.length > 0) {
        setAuthError('Bu e-posta adresi ile zaten kayıt olunmuş!')
        setShowRedirectToLogin(true)
        return
      }

      const { error: insertError } = await supabase.from('users').insert([
        { email: cleanEmail, password: password, user_name: cleanUserName }
      ])

      if (insertError) throw insertError

      alert('Kayıt başarılı! Şimdi giriş yapabilirsiniz. 🎉')
      setAuthMode('login')
      setPassword('')
    } catch (error: any) {
      setAuthError('Kayıt hatası: ' + (error.message || 'Bilinmeyen hata'))
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)

    const cleanEmail = email.trim().toLowerCase()

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .eq('password', password)

    if (error || !data || data.length === 0) {
      setAuthError('E-posta veya şifre hatalı!')
    } else {
      setUserName(data[0].user_name)
      setIsJoined(true)
    }
  }

  const handleLogout = () => {
    setIsJoined(false)
    setUserName('')
    setEmail('')
    setPassword('')
    setActiveDM(null)
    setActiveGroup(null)
    setMessages([])
  }

  // --- SOHBET VE PROFİL MANTIĞI ---

  const loadProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*')
    if (data) {
      const avatarMap: Record<string, string> = {}
      data.forEach((p) => {
        if (p.avatar_url) avatarMap[p.user_name] = p.avatar_url
      })
      setUserAvatars(avatarMap)
      if (avatarMap[userName]) setMyAvatar(avatarMap[userName])
    }
  }

  const loadGroups = async () => {
    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_name', userName)

    if (memberships && memberships.length > 0) {
      const gIds = memberships.map(m => m.group_id)
      const { data: gData } = await supabase.from('chat_groups').select('*').in('id', gIds)
      if (gData) setGroups(gData)
    } else {
      setGroups([])
    }
  }

  // AKTİF GRUP DEĞİŞTİĞİNDE ÜYELERİ YÜKLE
  useEffect(() => {
    if (!activeGroup) {
      setGroupMembers([])
      return
    }

    const loadActiveGroupMembers = async () => {
      const { data } = await supabase
        .from('group_members')
        .select('user_name')
        .eq('group_id', activeGroup.id)

      if (data) {
        setGroupMembers(data.map(m => m.user_name))
      }
    }

    loadActiveGroupMembers()
  }, [activeGroup])

  useEffect(() => {
    if (!isJoined) return

    loadProfiles()

    const loadFriendsAndRequests = async () => {
      const { data: reqs } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('receiver_name', userName)
        .eq('status', 'pending')
      if (reqs) setIncomingRequests(reqs)

      const { data: accepted } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('status', 'accepted')
        .or(`sender_name.eq.${userName},receiver_name.eq.${userName}`)

      if (accepted) {
        const list = accepted.map(r => r.sender_name === userName ? r.receiver_name : r.sender_name)
        setFriends(Array.from(new Set(list)))
      }
    }

    loadFriendsAndRequests()
    loadGroups()

    const profileChannel = supabase.channel('realtime-profiles').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadProfiles()).subscribe()
    const reqChannel = supabase.channel('realtime-requests').on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => loadFriendsAndRequests()).subscribe()
    const groupChannel = supabase.channel('realtime-groups').on('postgres_changes', { event: '*', schema: 'public', table: 'chat_groups' }, () => loadGroups()).subscribe()

    return () => {
      supabase.removeChannel(profileChannel)
      supabase.removeChannel(reqChannel)
      supabase.removeChannel(groupChannel)
    }
  }, [isJoined, userName])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true)
      if (!e.target.files || e.target.files.length === 0) return

      const file = e.target.files[0]
      const fileExt = file.name.split('.').pop()
      const safeUserName = userName.toLowerCase().replace(/[^a-z0-9]/g, '-')
      const fileName = `${safeUserName}-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const publicUrl = urlData.publicUrl

      await supabase.from('profiles').upsert([{ user_name: userName, avatar_url: publicUrl, updated_at: new Date().toISOString() }])
      setMyAvatar(publicUrl)
      alert('Profil fotoğrafın yüklendi! 🎉')
    } catch (error: any) {
      alert('Fotoğraf yüklenirken hata oluştu: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  // GRUPTAN ÜYE ÇIKARMA
  const removeMemberFromGroup = async (memberToRemove: string) => {
    if (!activeGroup) return

    if (memberToRemove === activeGroup.created_by) {
      alert('Grup kurucusu gruptan çıkarılamaz!')
      return
    }

    const confirmRemove = confirm(`${memberToRemove} kullanıcısını gruptan çıkarmak istediğine emin misin?`)
    if (!confirmRemove) return

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', activeGroup.id)
      .eq('user_name', memberToRemove)

    if (!error) {
      alert(`${memberToRemove} gruptan çıkarıldı!`)
      setGroupMembers(prev => prev.filter(m => m !== memberToRemove))
    } else {
      alert('Üye çıkarılırken bir hata oluştu: ' + error.message)
    }
  }

  // DM Mesaj Dinleyici
  useEffect(() => {
    if (activeTab !== 'dms' || !activeDM) return
    const loadDMs = async () => {
      const { data } = await supabase.from('direct_messages').select('*').or(`and(sender_name.eq.${userName},receiver_name.eq.${activeDM}),and(sender_name.eq.${activeDM},receiver_name.eq.${userName})`).order('created_at', { ascending: true })
      if (data) setMessages(data)
    }
    loadDMs()
    const channel = supabase.channel(`dm-${userName}-${activeDM}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
      const msg = payload.new as Message & { receiver_name: string }
      if ((msg.sender_name === userName && msg.receiver_name === activeDM) || (msg.sender_name === activeDM && msg.receiver_name === userName)) {
        setMessages(prev => [...prev, msg])
      }
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeDM, activeTab, userName])

  // Grup Mesaj Dinleyici
  useEffect(() => {
    if (activeTab !== 'groups' || !activeGroup) return
    const loadGroupMsgs = async () => {
      const { data } = await supabase.from('group_messages').select('*').eq('group_id', activeGroup.id).order('created_at', { ascending: true })
      if (data) setMessages(data)
    }
    loadGroupMsgs()
    const channel = supabase.channel(`group-msgs-${activeGroup.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${activeGroup.id}` }, (payload) => {
      setMessages(prev => [...prev, payload.new as Message])
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeGroup, activeTab])

  // ARKADAŞLIK İSTEĞİ GÖNDER
  const sendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    const target = friendInput.trim()

    if (!target) return

    if (target.toLowerCase() === userName.toLowerCase()) {
      alert('Kendine arkadaşlık isteği atamazsın! 😄')
      return
    }

    try {
      const { data: userCheck, error: checkError } = await supabase
        .from('users')
        .select('user_name')
        .ilike('user_name', target)

      if (checkError) throw checkError

      if (!userCheck || userCheck.length === 0) {
        alert(`"${target}" adında bir kullanıcı bulunamadı! ❌`)
        return
      }

      const realTargetName = userCheck[0].user_name

      const { data: existingReq } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`and(sender_name.eq.${userName},receiver_name.eq.${realTargetName}),and(sender_name.eq.${realTargetName},receiver_name.eq.${userName})`)

      if (existingReq && existingReq.length > 0) {
        alert('Bu kullanıcı ile zaten bir istek veya arkadaşlık durumunuz var!')
        return
      }

      const { error: insertError } = await supabase.from('friend_requests').insert([
        { sender_name: userName, receiver_name: realTargetName, status: 'pending' }
      ])

      if (insertError) throw insertError

      setFriendInput('')
      alert(`${realTargetName} kullanıcısına istek gönderildi! 🎉`)
    } catch (error: any) {
      alert('İstek gönderilirken hata oluştu: ' + error.message)
    }
  }

  const handleRequest = async (id: string, status: 'accepted' | 'rejected') => {
    await supabase.from('friend_requests').update({ status }).eq('id', id)
    setIncomingRequests(prev => prev.filter(r => r.id !== id))
  }

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!groupNameInput.trim()) return
    const { data: groupData } = await supabase.from('chat_groups').insert([{ name: groupNameInput, created_by: userName }]).select()
    if (groupData && groupData[0]) {
      await supabase.from('group_members').insert([{ group_id: groupData[0].id, user_name: userName }])
      setGroups(prev => [...prev, groupData[0]])
      setActiveGroup(groupData[0])
      setGroupNameInput('')
    }
  }

  const deleteGroup = async () => {
    if (!activeGroup) return

    const confirmDelete = confirm(`"${activeGroup.name}" grubunu KAPATMAK ve silmek istediğine emin misin? Tüm mesajlar silinecek!`)
    if (!confirmDelete) return

    const { error } = await supabase.from('chat_groups').delete().eq('id', activeGroup.id)

    if (error) {
      alert('Grup kapatılırken bir hata oluştu: ' + error.message)
    } else {
      alert('Grup başarıyla kapatıldı ve silindi! 🗑️')
      setActiveGroup(null)
      loadGroups()
    }
  }

  // GRUBA ARKADAŞ EKLEME
  const inviteFriendToGroup = async () => {
    if (!activeGroup || !selectedFriendToInvite) return

    // 1. Zaten grupta var mı kontrolü
    if (groupMembers.includes(selectedFriendToInvite)) {
      alert(`"${selectedFriendToInvite}" zaten grupta var! ⚠️`)
      setSelectedFriendToInvite('')
      return
    }

    // 2. Gruba Ekle
    const { error: insertErr } = await supabase.from('group_members').insert([
      { group_id: activeGroup.id, user_name: selectedFriendToInvite }
    ])

    if (!insertErr) {
      alert(`${selectedFriendToInvite} gruba başarıyla eklendi! 🎉`)
      setGroupMembers(prev => [...prev, selectedFriendToInvite])
      setSelectedFriendToInvite('')
    } else {
      alert('Zaten grupta var veya bir hata oluştu: ' + insertErr.message)
    }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const currentText = text
    setText('')
    if (activeTab === 'dms' && activeDM) {
      await supabase.from('direct_messages').insert([{ sender_name: userName, receiver_name: activeDM, content: currentText }])
    } else if (activeTab === 'groups' && activeGroup) {
      await supabase.from('group_messages').insert([{ group_id: activeGroup.id, sender_name: userName, content: currentText }])
    }
  }

  // A) GİRİŞ / KAYIT EKRANI
  if (!isJoined) {
    return (
      <main className="flex h-screen items-center justify-center bg-gray-950 text-white p-4">
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
          
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black text-blue-500 tracking-wider">ULTIMATE CHAT</h1>
            <p className="text-sm text-gray-400">
              {authMode === 'login' ? 'Hesabına giriş yap ve sohbet et!' : 'Yeni hesap oluştur ve aramıza katıl!'}
            </p>
          </div>

          {authError && (
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-center space-y-3">
              <p className="text-sm font-semibold text-red-400">{authError}</p>
              {showRedirectToLogin && (
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setAuthError(null); setShowRedirectToLogin(false); }}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg text-xs transition duration-200 shadow-md"
                >
                  ➡️ Giriş Yap Ekranına Git
                </button>
              )}
            </div>
          )}

          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4">
            {authMode === 'register' && (
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase">Kullanıcı Adı</label>
                <input
                  type="text"
                  placeholder="Örn: ahmet123"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 mt-1 text-sm"
                  required
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase">E-Posta Adresi</label>
              <input
                type="email"
                placeholder="ornek@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 rounded-xl bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 mt-1 text-sm"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase">Şifre</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded-xl bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 mt-1 text-sm"
                required
              />
            </div>

            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition text-sm cursor-pointer select-none">
              {authMode === 'login' ? 'Giriş Yap 🚀' : 'Kayıt Ol 📝'}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-gray-800">
            {authMode === 'login' ? (
              <p className="text-xs text-gray-400">
                Hesabın yok mu?{' '}
                <button type="button" onClick={() => { setAuthMode('register'); setAuthError(null); setShowRedirectToLogin(false); }} className="text-blue-400 hover:underline font-semibold">
                  Kayıt Ol
                </button>
              </p>
            ) : (
              <p className="text-xs text-gray-400">
                Zaten hesabın var mı?{' '}
                <button type="button" onClick={() => { setAuthMode('login'); setAuthError(null); setShowRedirectToLogin(false); }} className="text-blue-400 hover:underline font-semibold">
                  Giriş Yap
                </button>
              </p>
            )}
          </div>

        </div>
      </main>
    )
  }

  // B) SOHBET EKRANI
  return (
    <main className="flex h-screen bg-gray-950 text-white overflow-hidden relative">
      
      {/* ÜYE LİSTESİ VE ÇIKARMA MODALI */}
      {showMembersModal && activeGroup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-lg text-blue-400">👥 {activeGroup.name} Üyeleri</h3>
              <button 
                onClick={() => setShowMembersModal(false)}
                className="text-gray-400 hover:text-white text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-3 divide-y divide-gray-800/50">
              {groupMembers.map((member) => (
                <div key={member} className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center font-bold text-xs text-blue-400">
                      {userAvatars[member] ? (
                        <img src={userAvatars[member]} alt={member} className="w-full h-full object-cover" />
                      ) : (
                        member[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-sm text-gray-200 block">{member}</span>
                      {member === activeGroup.created_by && (
                        <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">👑 Kurucu</span>
                      )}
                    </div>
                  </div>

                  {/* Sadece Grup Kurucusu Üyeleri Çıkarabilir */}
                  {activeGroup.created_by === userName && member !== userName && (
                    <button
                      onClick={() => removeMemberFromGroup(member)}
                      className="bg-red-500/10 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white px-2.5 py-1 rounded text-xs transition font-semibold"
                    >
                      Çıkar ❌
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button 
              onClick={() => setShowMembersModal(false)}
              className="w-full bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-xl text-xs font-semibold transition mt-2"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* SOL PANEL */}
      <aside className="w-80 border-r border-gray-800 bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="relative group w-10 h-10 rounded-full overflow-hidden bg-blue-600/30 border border-blue-500/50 flex items-center justify-center font-bold text-blue-400">
              {myAvatar ? <img src={myAvatar} alt="Avatar" className="w-full h-full object-cover" /> : userName[0]?.toUpperCase()}
            </div>
            <div>
              <span className="font-bold text-sm text-gray-200 block">{userName}</span>
              <label className="text-[10px] text-blue-400 hover:underline cursor-pointer">
                {uploading ? 'Yükleniyor...' : 'Fotoğraf Değiştir'}
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploading} />
              </label>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Çıkış Yap"
            className="bg-red-500/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
          >
            🚪 Çıkış
          </button>
        </div>

        {/* Tab Geçişleri */}
        <div className="grid grid-cols-3 border-b border-gray-800 bg-gray-950/50 p-1 text-xs">
          <button onClick={() => setActiveTab('dms')} className={`py-2 rounded font-semibold transition ${activeTab === 'dms' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>💬 DM'ler</button>
          <button onClick={() => setActiveTab('groups')} className={`py-2 rounded font-semibold transition ${activeTab === 'groups' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>👥 Gruplar</button>
          <button onClick={() => setActiveTab('requests')} className={`py-2 relative rounded font-semibold transition ${activeTab === 'requests' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            📩 İstekler
            {incomingRequests.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />}
          </button>
        </div>

        {/* TAB 1: DM'LER */}
        {activeTab === 'dms' && (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-800/50">
            {friends.length === 0 ? (
              <p className="p-4 text-xs text-gray-500 text-center">Henüz arkadaşın yok. "İstekler" kısmından ekle!</p>
            ) : (
              friends.map((friend) => (
                <button key={friend} onClick={() => setActiveDM(friend)} className={`w-full p-3.5 text-left transition flex items-center gap-3 ${activeDM === friend ? 'bg-blue-600/20 border-l-4 border-blue-500' : 'hover:bg-gray-800/50'}`}>
                  <div className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center font-bold text-xs text-blue-400">
                    {userAvatars[friend] ? <img src={userAvatars[friend]} alt={friend} className="w-full h-full object-cover" /> : friend[0]?.toUpperCase()}
                  </div>
                  <span className="font-semibold text-sm text-gray-200">{friend}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* TAB 2: GRUPLAR */}
        {activeTab === 'groups' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <form onSubmit={createGroup} className="p-3 border-b border-gray-800 flex gap-2">
              <input type="text" placeholder="+ Yeni Grup İsmi" value={groupNameInput} onChange={(e) => setGroupNameInput(e.target.value)} className="flex-1 p-2 bg-gray-800 text-xs rounded border border-gray-700 focus:outline-none focus:border-blue-500 text-white" />
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs rounded font-semibold">Kur</button>
            </form>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-800/50">
              {groups.map((group) => (
                <button key={group.id} onClick={() => setActiveGroup(group)} className={`w-full p-3.5 text-left transition flex items-center gap-3 ${activeGroup?.id === group.id ? 'bg-blue-600/20 border-l-4 border-blue-500' : 'hover:bg-gray-800/50'}`}>
                  <span className="text-lg">📢</span>
                  <div>
                    <p className="font-semibold text-sm text-gray-200">{group.name}</p>
                    <p className="text-[10px] text-gray-500">Kurucu: {group.created_by}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: İSTEKLER */}
        {activeTab === 'requests' && (
          <div className="flex-1 p-4 space-y-6 overflow-y-auto">
            <form onSubmit={sendFriendRequest} className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Arkadaş Ekle</label>
              <div className="flex gap-2">
                <input type="text" placeholder="Kullanıcı adı..." value={friendInput} onChange={(e) => setFriendInput(e.target.value)} className="flex-1 p-2 bg-gray-800 text-xs rounded border border-gray-700 focus:outline-none focus:border-blue-500 text-white" />
                <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs rounded font-semibold">İstek At</button>
              </div>
            </form>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gelen İstekler ({incomingRequests.length})</h3>
              {incomingRequests.map((req) => (
                <div key={req.id} className="p-3 bg-gray-800/60 rounded-xl border border-gray-700/50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-200">{req.sender_name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleRequest(req.id, 'accepted')} className="bg-green-600 hover:bg-green-500 px-3 py-1 text-xs rounded font-semibold">Kabul</button>
                    <button onClick={() => handleRequest(req.id, 'rejected')} className="bg-red-600 hover:bg-red-500 px-3 py-1 text-xs rounded font-semibold">Reddet</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* SAĞ PANEL: Sohbet */}
      <section className="flex-1 flex flex-col bg-gray-950">
        {(activeTab === 'dms' && activeDM) || (activeTab === 'groups' && activeGroup) ? (
          <>
            <header className="p-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                {activeTab === 'dms' && activeDM ? (
                  <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-xs text-blue-400">
                    {userAvatars[activeDM] ? <img src={userAvatars[activeDM]} alt={activeDM} className="w-full h-full object-cover" /> : activeDM[0]?.toUpperCase()}
                  </div>
                ) : (
                  <span className="text-xl">📢</span>
                )}
                <div>
                  <h2 className="font-bold text-sm text-gray-100">{activeTab === 'dms' ? activeDM : activeGroup?.name}</h2>
                  <p className="text-[10px] text-gray-400">{activeTab === 'dms' ? 'Özel DM' : `Kurucu: ${activeGroup?.created_by}`}</p>
                </div>
              </div>

              {/* GRUP KONTROLLERİ */}
              {activeTab === 'groups' && activeGroup && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowMembersModal(true)} 
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-3 py-1.5 text-xs rounded font-semibold transition flex items-center gap-1"
                  >
                    👥 Üyeler ({groupMembers.length})
                  </button>

                  {/* Sadece Grup Kurucusu Üye Ekleyebilir ve Grubu Kapatabilir */}
                  {activeGroup.created_by === userName && (
                    <>
                      {/* Sadece HENÜZ grupta OLMAMAYAN arkadaşları listede göster */}
                      <select 
                        value={selectedFriendToInvite} 
                        onChange={(e) => setSelectedFriendToInvite(e.target.value)} 
                        className="bg-gray-800 border border-gray-700 text-xs rounded p-1.5 text-white focus:outline-none"
                      >
                        <option value="">-- Arkadaş Seç --</option>
                        {friends
                          .filter(f => !groupMembers.includes(f))
                          .map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))
                        }
                      </select>

                      <button onClick={inviteFriendToGroup} className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs rounded font-semibold transition">
                        Gruba Ekle
                      </button>

                      <button onClick={deleteGroup} className="bg-red-600/20 hover:bg-red-600 border border-red-500/50 text-red-400 hover:text-white px-3 py-1.5 text-xs rounded font-semibold transition">
                        🗑️ Grubu Kapat
                      </button>
                    </>
                  )}
                </div>
              )}
            </header>

            {/* Mesaj Alanı */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => {
                const isMe = msg.sender_name === userName
                const senderAvatar = userAvatars[msg.sender_name]

                return (
                  <div key={msg.id} className={`flex gap-2 items-end ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-[10px] text-blue-400">
                      {senderAvatar ? <img src={senderAvatar} alt={msg.sender_name} className="w-full h-full object-cover" /> : msg.sender_name[0]?.toUpperCase()}
                    </div>

                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] text-gray-400 mb-1 px-1">{msg.sender_name}</span>
                      <div className={`p-3 rounded-2xl max-w-xs md:max-w-md text-sm break-words ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-800 text-gray-200 rounded-tl-none border border-gray-700/50'}`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <footer className="p-4 bg-gray-900 border-t border-gray-800">
              <form onSubmit={sendMessage} className="flex gap-2">
                <input type="text" placeholder="Bir mesaj yazın..." value={text} onChange={(e) => setText(e.target.value)} className="flex-1 p-3 bg-gray-800 text-white rounded-xl border border-gray-700 focus:outline-none focus:border-blue-500 text-sm" />
                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-sm font-semibold select-none cursor-pointer">Gönder</button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Sohbet etmek için soldan bir DM veya Grup seçin.
          </div>
        )}
      </section>

    </main>
  )
}