import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../features/auth/store';
import { useChatStore } from '../features/chats/store';
import { useTheme } from '../hooks/useTheme';
import {
  Search, MessageCircle, LogOut, Moon, Sun, Plus, Send,
  Phone, Video, Paperclip, Smile, ChevronLeft, Users, X,
  PhoneOff, Mic, MicOff, VideoOff, MoreVertical, Camera, UserRound, Save, Pencil, FileText, Download, Minimize2, Maximize2, Circle, Square, AudioLines, Settings, ShieldBan, Ban, ShieldCheck
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { api } from '../services/api';
import { getSocket } from '../services/socket';

const EMOJIS = ['😀','😂','😍','🤔','👍','👎','❤️','🔥','🎉','👏','😢','😮','🙏','✨','💯','🚀','😎','🤝','💪','✅'];

function Avatar({ name, url, size = 40, status }: { name: string; url?: string | null; size?: number; status?: string }) {
  const initials = (name || '?').slice(0, 2).toUpperCase();
  const colors = ['bg-nova-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
  const color = colors[(name || 'A').charCodeAt(0) % colors.length];
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="w-full h-full rounded-full object-cover" />
      ) : (
        <div className={`w-full h-full rounded-full ${color} flex items-center justify-center text-white font-semibold`} style={{ fontSize: size * 0.35 }}>
          {initials}
        </div>
      )}
      {status === 'online' && (
        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-gray-800 rounded-full" />
      )}
    </div>
  );
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Вчера';
  return format(d, 'dd.MM.yy', { locale: ru });
}

export default function MessengerPage() {
  const { user, logout, setUser } = useAuthStore();
  const {
    chats, currentChatId, messages, typing, connected, loading,
    selectChat, sendMessage, createPrivateChat, createGroup
  } = useChatStore();
  const { theme, toggle } = useTheme();
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('nova-blocked-users') || '[]'); } catch { return []; } });
  const [moderationBusy, setModerationBusy] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSelected, setGroupSelected] = useState<{id:string;displayName:string;username:string}[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<any | null>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const profileAvatarRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [oneTimeMode, setOneTimeMode] = useState(false);
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('nova-accent-color') || '#8b5cf6');
  const [chatWallpaper, setChatWallpaper] = useState(() => localStorage.getItem('nova-wallpaper-' + (currentChatId || 'global')) || '');
  const [callPosition, setCallPosition] = useState(() => { try { return JSON.parse(localStorage.getItem('nova-call-position') || '{"x":null,"y":null}'); } catch { return {x:null,y:null}; } });
  const callDragRef = useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [msgSearch, setMsgSearch] = useState('');
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'connecting' | 'active'>('idle');
  const [callVideo, setCallVideo] = useState(false);
  const [callPeer, setCallPeer] = useState<{ id: string; name: string } | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [callError, setCallError] = useState('');
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [callMinimized, setCallMinimized] = useState(false);
  const [recordingKind, setRecordingKind] = useState<'voice' | 'video-note' | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const [rtcDebug, setRtcDebug] = useState({ pc: '—', ice: '—', local: '—', remote: '—', relay: 'Загрузка настроек…' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const recordingVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callPeerIdRef = useRef<string | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const currentChat = chats.find((c) => c.id === currentChatId);
  useEffect(() => { document.documentElement.style.setProperty('--nova-accent', accentColor); localStorage.setItem('nova-accent-color', accentColor); }, [accentColor]);
  useEffect(() => { setChatWallpaper(localStorage.getItem('nova-wallpaper-' + (currentChatId || 'global')) || ''); }, [currentChatId]);
  useEffect(() => { if (!callMinimized) return; const move = (e: PointerEvent) => { if (!callDragRef.current) return; const x = Math.max(0, Math.min(window.innerWidth - 290, e.clientX - callDragRef.current.x + callDragRef.current.left)); const y = Math.max(0, Math.min(window.innerHeight - 200, e.clientY - callDragRef.current.y + callDragRef.current.top)); setCallPosition({x,y}); localStorage.setItem('nova-call-position', JSON.stringify({x,y})); }; const up = () => { callDragRef.current = null; }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; }, [callMinimized, callPosition]);
  const chatMessages = currentChatId ? messages[currentChatId] || [] : [];
  const typingUsers = currentChatId ? typing[currentChatId] || [] : [];
  const otherUser = currentChat?.members?.find((m: any) => m.id !== user?.id);

  const visibleMessages = (msgSearch.trim()
    ? chatMessages.filter((m) => (m.content || '').toLowerCase().includes(msgSearch.toLowerCase()))
    : chatMessages).filter((m) => !blockedUserIds.includes(m.sender?.id));
  const isOwner = user?.username?.toLowerCase() === 'okak';
  const isModerator = user?.username?.toLowerCase() === 'sladkiy';
  const currentPeerBlocked = !!otherUser && blockedUserIds.includes(otherUser.id);

  useEffect(() => { try { localStorage.setItem('nova-blocked-users', JSON.stringify(blockedUserIds)); } catch {} }, [blockedUserIds]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length]);

  useEffect(() => {
    if (!userSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { users } = await api.searchUsers(userSearch);
        setSearchResults(users);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onIncoming = ({ fromUserId, fromUsername, offer, isVideo }: any) => {
      if (!fromUserId || !offer) return;
      // Ignore duplicate incoming offers while already in a call.
      if (callPeerIdRef.current && callPeerIdRef.current !== fromUserId) return;
      setCallPeer({ id: fromUserId, name: fromUsername || 'Абонент' });
      callPeerIdRef.current = fromUserId;
      pendingOfferRef.current = offer;
      setCallVideo(!!isVideo);
      setCallState('incoming');
      setCallError('');
      setAudioPlaybackBlocked(false);
    };

    const onAnswer = async ({ fromUserId, answer }: any) => {
      try {
        if (!pcRef.current || !answer) return;
        if (fromUserId && callPeerIdRef.current !== fromUserId) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingIceCandidates(pcRef.current);
        setCallState('connecting');
      } catch (e) {
        console.error('answer error', e);
        setCallError('Не удалось согласовать соединение. Попробуйте перезвонить.');
      }
    };

    const onIce = async ({ fromUserId, candidate }: any) => {
      if (!candidate || !fromUserId) return;
      const activePeerId = callPeerIdRef.current;
      if (activePeerId && activePeerId !== fromUserId) return;

      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        // ICE candidates may arrive before the user accepts the call or before
        // setRemoteDescription() finishes. Keep them instead of losing them.
        const queue = pendingIceCandidatesRef.current.get(fromUserId) || [];
        queue.push(candidate as RTCIceCandidateInit);
        pendingIceCandidatesRef.current.set(fromUserId, queue);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('ICE candidate could not be added', e);
      }
    };

    const onEnded = () => cleanupCall(false);
    const onRejected = () => {
      setCallError('Звонок отклонён');
      setTimeout(() => cleanupCall(false), 1500);
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIce);
    socket.on('call:ended', onEnded);
    socket.on('call:rejected', onRejected);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIce);
      socket.off('call:ended', onEnded);
      socket.off('call:rejected', onRejected);
    };
  }, [user]);

  async function flushPendingIceCandidates(pc: RTCPeerConnection) {
    const peerId = callPeerIdRef.current;
    if (!peerId || !pc.remoteDescription) return;
    const pending = pendingIceCandidatesRef.current.get(peerId) || [];
    pendingIceCandidatesRef.current.delete(peerId);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Queued ICE candidate could not be added', e);
      }
    }
  }

  async function enableRemoteAudio() {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    try {
      audio.muted = false;
      await audio.play();
      setAudioPlaybackBlocked(false);
    } catch (e) {
      console.warn('Remote audio playback is still blocked', e);
      setAudioPlaybackBlocked(true);
    }
  }

  function cleanupCall(notify: boolean) {
    const peerId = callPeerIdRef.current;
    if (notify && peerId) {
      getSocket()?.emit('call:end', { toUserId: peerId });
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingOfferRef.current = null;
    pendingIceCandidatesRef.current.clear();
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    callPeerIdRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setCallState('idle');
    setCallMinimized(false);
    setCallPeer(null);
    setMicOn(true);
    setCamOn(true);
    setCallError('');
    setAudioPlaybackBlocked(false);
    setRtcDebug({ pc: '—', ice: '—', local: '—', remote: '—', relay: '—' });
  }

  async function createPeer(isVideo: boolean, remoteUserId: string) {
    // Fetch ICE server settings from the authenticated backend. The long-lived
    // Cloudflare API token is never sent to the browser.
    let iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    let relayLabel = 'TURN не настроен — используется только STUN';
    try {
      const iceConfig = await api.getIceServers();
      if (Array.isArray(iceConfig.iceServers) && iceConfig.iceServers.length > 0) {
        iceServers = iceConfig.iceServers;
      }
      relayLabel = iceConfig.relayConfigured
        ? `TURN: ${iceConfig.relayProvider || 'настроен'}`
        : 'TURN не настроен — используется только STUN';
    } catch (error) {
      console.warn('Could not load backend ICE configuration; falling back to public STUN servers.', error);
      relayLabel = 'Не удалось загрузить TURN — используется STUN';
    }

    setRtcDebug({ pc: 'new', ice: 'new', local: 'ожидание разрешений', remote: 'дорожек пока нет', relay: relayLabel });
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });
    pcRef.current = pc;
    callPeerIdRef.current = remoteUserId;
    // Keep one stable stream and add each remote track to it. Some browsers may
    // expose audio/video as separate stream objects; replacing srcObject on every
    // track event can otherwise make one of the media types disappear.
    remoteStreamRef.current = new MediaStream();

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        getSocket()?.emit('call:ice-candidate', {
          toUserId: remoteUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.addEventListener('icecandidateerror', (event: Event) => {
      const iceError = event as Event & { errorCode?: number; errorText?: string; url?: string };
      console.warn('WebRTC ICE server error', {
        code: iceError.errorCode,
        text: iceError.errorText,
        url: iceError.url,
      });
    });

    pc.ontrack = (event) => {
      const remoteStream = remoteStreamRef.current || new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }

      const updateRemoteTrackStatus = () => {
        const tracks = remoteStream.getTracks();
        setRtcDebug((previous) => ({
          ...previous,
          remote: tracks.length
            ? tracks.map((track) => `${track.kind}:${track.readyState}${track.enabled ? '' : '(off)'}`).join(', ')
            : 'дорожек пока нет',
        }));
      };

      const attachRemoteMedia = async () => {
        if (remoteAudioRef.current) {
          if (remoteAudioRef.current.srcObject !== remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
          }
          remoteAudioRef.current.muted = false;
          try {
            await remoteAudioRef.current.play();
            setAudioPlaybackBlocked(false);
          } catch (error) {
            console.warn('Remote audio playback blocked by browser', error);
            setAudioPlaybackBlocked(true);
          }
        }

        if (remoteVideoRef.current) {
          if (remoteVideoRef.current.srcObject !== remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          remoteVideoRef.current.muted = true;
          try {
            await remoteVideoRef.current.play();
          } catch (error) {
            console.warn('Remote video playback failed', error);
          }
        }
        updateRemoteTrackStatus();
      };

      event.track.onunmute = () => { void attachRemoteMedia(); };
      event.track.onmute = updateRemoteTrackStatus;
      event.track.onended = updateRemoteTrackStatus;
      updateRemoteTrackStatus();
      void attachRemoteMedia();
    };

    pc.onconnectionstatechange = () => {
      setRtcDebug((previous) => ({ ...previous, pc: pc.connectionState, ice: pc.iceConnectionState }));
      if (pc.connectionState === 'failed') {
        setCallError('WebRTC: соединение не установилось. Проверьте ICE ниже; для разных сетей обычно требуется TURN.');
      } else if (pc.connectionState === 'disconnected') {
        setCallError('WebRTC: соединение прервано. Ожидаем восстановления…');
      } else if (pc.connectionState === 'connected') {
        setCallState('active');
        setCallError('');
      } else if (pc.connectionState === 'connecting') {
        setCallState('connecting');
      }
    };

    pc.oniceconnectionstatechange = () => {
      setRtcDebug((previous) => ({ ...previous, pc: pc.connectionState, ice: pc.iceConnectionState }));
      if (pc.iceConnectionState === 'failed') {
        setCallError('ICE failed: устройства не нашли сетевой маршрут. Настройте TURN-сервер и попробуйте снова.');
      } else if (pc.iceConnectionState === 'checking') {
        setCallError('Проверяем сетевой маршрут между устройствами…');
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: isVideo ? { facingMode: 'user' } : false,
    });
    localStreamRef.current = stream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    setRtcDebug((previous) => ({
      ...previous,
      local: stream.getTracks().map((track) => `${track.kind}:${track.readyState}${track.enabled ? '' : '(off)'}`).join(', ') || 'дорожек нет',
    }));

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      if (isVideo) void localVideoRef.current.play().catch((error) => console.warn('Local video playback failed', error));
    }
    return pc;
  }

  async function startCall(isVideo: boolean) {
    if (!otherUser?.id) {
      alert('Звонки только в личном чате с одним собеседником');
      return;
    }
    if (!connected) {
      alert('Нет связи с сервером. Подождите подключения.');
      return;
    }
    pendingIceCandidatesRef.current.clear();
    pendingOfferRef.current = null;
    setAudioPlaybackBlocked(false);
    callPeerIdRef.current = otherUser.id;
    setCallVideo(isVideo);
    setCallPeer({ id: otherUser.id, name: otherUser.displayName || otherUser.username });
    setCallState('calling');
    setCallError('');
    setShowMenu(false);
    try {
      const pc = await createPeer(isVideo, otherUser.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket()?.emit('call:offer', {
        toUserId: otherUser.id,
        offer: pc.localDescription,
        isVideo,
      });
    } catch (err: any) {
      console.error(err);
      alert('Не удалось начать звонок: ' + (err?.message || 'нет доступа к микрофону/камере'));
      cleanupCall(false);
    }
  }

  async function acceptCall() {
    if (!callPeer) return;
    try {
      const offer = pendingOfferRef.current;
      if (!offer) throw new Error('Не найдено описание входящего звонка');
      const pc = await createPeer(callVideo, callPeer.id);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      pendingOfferRef.current = null;
      await flushPendingIceCandidates(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket()?.emit('call:answer', {
        toUserId: callPeer.id,
        answer: pc.localDescription,
      });
      setCallState('connecting');
      setCallError('');
    } catch (err: any) {
      console.error(err);
      alert('Не удалось принять звонок: ' + (err?.message || 'проверьте доступ к микрофону и камере'));
      cleanupCall(true);
    }
  }

  function rejectCall() {
    if (callPeer) getSocket()?.emit('call:reject', { toUserId: callPeer.id });
    cleanupCall(false);
  }

  function toggleMic() {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setMicOn(t.enabled);
    }
  }

  function toggleCam() {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setCamOn(t.enabled);
    }
  }

  async function startMediaMessage(kind: 'voice' | 'video-note') {
    if (!currentChatId) { alert('Сначала открой чат'); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      alert('Браузер не поддерживает запись. Открой сайт через HTTPS и обнови браузер.'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: kind === 'video-note' ? { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } } : false });
      recordingStreamRef.current = stream;
      if (kind === 'video-note' && recordingVideoRef.current) { recordingVideoRef.current.srcObject = stream; recordingVideoRef.current.play().catch(() => {}); }
      const candidates = kind === 'voice'
        ? ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        : ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        if (recordingVideoRef.current) recordingVideoRef.current.srcObject = null;
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        setRecordingKind(null); setRecordingSeconds(0);
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || (kind === 'voice' ? 'audio/webm' : 'video/webm') });
        if (!blob.size) return;
        if (blob.size > 10 * 1024 * 1024) { alert('Запись больше 10 МБ. Сделай её короче.'); return; }
        const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `${kind === 'voice' ? 'voice' : 'video-note'}-${Date.now()}.${ext}`, { type: blob.type });
        try {
          const { file: uploaded } = await api.uploadFile(file, 'attachment');
          await sendMessage(currentChatId, '', undefined, { type: kind, fileUrl: uploaded.url, fileName: uploaded.name, fileSize: uploaded.size });
        } catch (err: any) { alert(err.message || 'Не удалось отправить запись'); }
      };
      recorder.start(250);
      setRecordingKind(kind); setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((v) => { if (v >= 59) { mediaRecorderRef.current?.stop(); return 60; } return v + 1; }), 1000);
    } catch (err: any) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      alert('Нет доступа к микрофону/камере: ' + (err?.message || 'разреши доступ в браузере'));
    }
  }

  function stopMediaMessage() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
  }

  const handleSend = async () => {
    if (editingMessageId && currentChatId) {
      const content = text.trim(); if (!content) return;
      try { const { message } = await api.editMessage(editingMessageId, content);
        useChatStore.setState((st) => ({ messages: { ...st.messages, [currentChatId]: (st.messages[currentChatId] || []).map((m:any) => m.id === editingMessageId ? message : m) } }));
        setEditingMessageId(null); setText(''); setOneTimeMode(false); return;
      } catch (e:any) { alert(e.message || 'Не удалось изменить сообщение'); return; }
    }
    if (currentPeerBlocked) { alert('Сначала разблокируйте пользователя, чтобы отправить сообщение.'); return; }
    if (!text.trim() || !currentChatId) return;
    const content = text.trim();
    setText('');
    setShowEmoji(false);
    await sendMessage(currentChatId, content);
    if (oneTimeMode) { try { const state = useChatStore.getState(); const latest = (state.messages[currentChatId] || []).slice(-1)[0]; if (latest) { localStorage.setItem('nova-once-' + latest.id, String(Date.now() + 10000)); window.setTimeout(async () => { try { await api.deleteMessage(latest.id); } catch {} useChatStore.setState((st) => ({ messages: { ...st.messages, [currentChatId]: (st.messages[currentChatId] || []).filter((m:any) => m.id !== latest.id) } })); }, 10000); } } catch {} setOneTimeMode(false); }
    getSocket()?.emit('typing:stop', { chatId: currentChatId });
  };

  const handleTyping = (value: string) => {
    setText(value);
    if (!currentChatId) return;
    getSocket()?.emit('typing:start', { chatId: currentChatId });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      getSocket()?.emit('typing:stop', { chatId: currentChatId });
    }, 2000);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentChatId) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Максимум 5 МБ');
      return;
    }
    try {
      const { file: uploaded } = await api.uploadFile(file, 'attachment');
      await sendMessage(currentChatId, '', undefined, {
        type: uploaded.type,
        fileUrl: uploaded.url,
        fileName: uploaded.name,
        fileSize: uploaded.size,
      });
    } catch (err: any) {
      alert(err.message || 'Не удалось отправить файл');
    }
  };

  const startChat = async (userId: string) => {
    const chat = await createPrivateChat(userId);
    selectChat(chat.id);
    setShowNewChat(false);
    setMobileShowChat(true);
  };

  const filteredChats = chats.filter((c) =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const openProfile = async (target: any) => {
    if (!target?.id) return;
    setProfileUser(target);
    setProfileDisplayName(target.displayName || '');
    setProfileBio(target.bio || '');
    setProfileAvatarUrl(target.avatarUrl || null);
    setProfileEditing(false);
    setProfileOpen(true);
    try {
      const { user: fullProfile } = await api.getProfile(target.id);
      setProfileUser(fullProfile);
      setProfileDisplayName(fullProfile.displayName || '');
      setProfileBio(fullProfile.bio || '');
      setProfileAvatarUrl(fullProfile.avatarUrl || null);
    } catch (e) {
      console.error('Не удалось загрузить профиль', e);
    }
  };

  const handleProfileAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Для аватарки выбери изображение.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Аватарка должна быть не больше 5 МБ.');
      return;
    }
    setProfileBusy(true);
    try {
      const { file: uploaded } = await api.uploadFile(file, 'avatar');
      setProfileAvatarUrl(uploaded.url);
    } catch (err: any) {
      alert(err.message || 'Не удалось загрузить аватарку');
    } finally {
      setProfileBusy(false);
    }
  };

  const saveProfile = async () => {
    setProfileBusy(true);
    try {
      const { user: updatedUser } = await api.updateProfile({
        displayName: profileDisplayName.trim(),
        bio: profileBio,
        avatarUrl: profileAvatarUrl,
      });
      setUser(updatedUser);
      setProfileUser(updatedUser);
      setProfileEditing(false);
    } catch (err: any) {
      alert(err.message || 'Не удалось сохранить профиль');
    } finally {
      setProfileBusy(false);
    }
  };

  return (
    <div className="h-full w-full min-w-0 max-w-full flex overflow-hidden bg-gray-100 dark:bg-surface-dark" onClick={() => { setShowMenu(false); }}>
      <aside className={`w-full min-w-0 md:w-80 lg:w-96 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 ${mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-nova-500 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg">Nova</span>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} title={connected ? 'Онлайн' : 'Офлайн'} />
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setSettingsOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Настройки">
                <Settings className="w-5 h-5" />
              </button>
              <button type="button" onClick={toggle} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Тема">
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button type="button" onClick={() => setShowNewChat(true)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Новый чат">
                <Plus className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => logout()} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500" title="Выйти">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск" className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border-0 focus:ring-2 focus:ring-nova-500 outline-none text-sm" />
          </div>
        </div>

        <button type="button" onClick={() => openProfile(user)} className="w-full px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60">
          <Avatar name={user?.displayName || ''} url={user?.avatarUrl} status="online" />
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{user?.displayName}</p>
            <p className="text-xs text-gray-500 truncate">@{user?.username}</p>
          </div>
          <Pencil className="w-4 h-4 text-gray-400" />
        </button>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-8 text-center text-gray-400 text-sm">Загрузка...</div>}
          {!loading && filteredChats.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              Нет диалогов. Нажмите +
            </div>
          )}
          {filteredChats.map((chat) => (
            <button key={chat.id} type="button" onClick={() => { selectChat(chat.id); setMobileShowChat(true); setShowMsgSearch(false); setMsgSearch(''); }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left ${currentChatId === chat.id ? 'bg-nova-50 dark:bg-nova-950/40' : ''}`}>
              <Avatar name={chat.name || '?'} url={chat.avatarUrl} status={chat.members?.find((m: any) => m.id !== user?.id)?.status} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-baseline">
                  <p className="font-medium truncate">{chat.name}</p>
                  {chat.lastMessageAt && <span className="text-xs text-gray-400 ml-2">{formatTime(chat.lastMessageAt)}</span>}
                </div>
                <p className="text-sm text-gray-500 truncate">{chat.lastMessage?.content || (chat.lastMessage?.type === 'image' ? '📷 Фото' : chat.lastMessage?.type === 'file' ? `📎 ${chat.lastMessage?.fileName || 'Файл'}` : 'Нет сообщений')}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className={`flex-1 min-w-0 w-0 flex flex-col overflow-hidden bg-gray-50 dark:bg-surface-dark ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
        {!currentChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MessageCircle className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">Выберите чат</p>
          </div>
        ) : (
          <>
            <header className="flex min-w-0 items-center gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 relative">
              <button type="button" className="md:hidden p-1" onClick={() => setMobileShowChat(false)}><ChevronLeft className="w-6 h-6" /></button>
              <button type="button" onClick={() => currentChat.type === 'private' && otherUser && openProfile(otherUser)} title="Открыть профиль" className="rounded-full focus:outline-none focus:ring-2 focus:ring-nova-500">
                <Avatar name={currentChat.name || '?'} url={currentChat.avatarUrl} status={otherUser?.status} />
              </button>
              <button type="button" onClick={() => currentChat.type === 'private' && otherUser && openProfile(otherUser)} className="flex-1 min-w-0 text-left rounded-lg hover:opacity-80">
                <p className="font-semibold truncate">{currentChat.name}</p>
                <p className="text-xs text-gray-500">
                  {typingUsers.length > 0 ? 'печатает...' : otherUser?.status === 'online' ? 'в сети' : 'был(а) недавно'}
                </p>
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); startCall(false); }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Голосовой">
                <Phone className="w-5 h-5" />
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); startCall(true); }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Видео">
                <Video className="w-5 h-5" />
              </button>
              <div className="relative">
                <button type="button" onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Меню">
                  <MoreVertical className="w-5 h-5" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 w-52 rounded-xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-30" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => {
                      setShowMenu(false);
                      alert(
                        `Чат: ${currentChat.name}\nТип: ${currentChat.type === 'group' ? 'группа' : 'личный'}\n` +
                        (otherUser ? `Собеседник: ${otherUser.displayName} (@${otherUser.username})\nСтатус: ${otherUser.status || '—'}` : '')
                      );
                    }}>Информация о чате</button>
                    <button type="button" className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => {
                      setShowMenu(false);
                      setShowMsgSearch(true);
                    }}>Поиск по сообщениям</button>
                    <button type="button" className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => {
                      setShowMenu(false);
                      startCall(false);
                    }}>Голосовой звонок</button>
                    <button type="button" className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => {
                      setShowMenu(false);
                      startCall(true);
                    }}>Видеозвонок</button>
                    {otherUser && currentChat.type === 'private' && <button type="button" className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-amber-600" onClick={() => {
                      setShowMenu(false);
                      setBlockedUserIds((ids) => ids.includes(otherUser.id) ? ids.filter((id) => id !== otherUser.id) : [...ids, otherUser.id]);
                    }}>{currentPeerBlocked ? 'Разблокировать пользователя' : 'Заблокировать пользователя'}</button>}
                    {otherUser && (isOwner || isModerator) && otherUser.username?.toLowerCase() !== user?.username?.toLowerCase() && <button type="button" disabled={moderationBusy} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 disabled:opacity-50" onClick={async () => {
                      setShowMenu(false);
                      const action = otherUser.status === 'banned' ? 'unban' : 'ban';
                      if (!confirm(`${action === 'ban' ? 'Забанить' : 'Разбанить'} пользователя @${otherUser.username}?`)) return;
                      setModerationBusy(true);
                      try { await api.moderateUser(otherUser.username, action); alert(action === 'ban' ? 'Пользователь забанен.' : 'Пользователь разбанен.'); }
                      catch (err: any) { alert(err.message || 'Не удалось выполнить действие'); }
                      finally { setModerationBusy(false); }
                    }}>{otherUser.status === 'banned' ? 'Разбанить пользователя' : 'Забанить пользователя'}</button>}
                    <button type="button" className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500" onClick={() => {
                      setShowMenu(false);
                      if (confirm('Закрыть этот чат в списке? (история на сервере сохранится)')) {
                        selectChat(null);
                        setMobileShowChat(false);
                      }
                    }}>Закрыть чат</button>
                  </div>
                )}
              </div>
            </header>

            {showMsgSearch && (
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex gap-2">
                <input
                  autoFocus
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                  placeholder="Поиск в переписке..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-nova-500"
                />
                <button type="button" className="text-sm text-gray-500 px-2" onClick={() => { setShowMsgSearch(false); setMsgSearch(''); }}>Закрыть</button>
              </div>
            )}

            {currentPeerBlocked && <div className="px-4 py-2 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100 text-sm">Пользователь заблокирован: его сообщения скрыты. Отправка сообщений отключена. <button type="button" className="underline font-medium" onClick={() => setBlockedUserIds((ids) => ids.filter((id) => id !== otherUser?.id))}>Разблокировать</button></div>}
            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-3 transition-colors duration-300" style={chatWallpaper ? { backgroundImage: `linear-gradient(rgba(10,10,20,.25),rgba(10,10,20,.25)), url(${chatWallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
              {visibleMessages.map((msg) => {
                const isMine = msg.sender.id === user?.id || msg.sender.id === 'me';
                return (
                  <div key={msg.id} className={`flex min-w-0 w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`min-w-0 max-w-[85%] md:max-w-[75%] px-3.5 py-2 ${isMine ? 'msg-out' : 'msg-in'}`}>
                      {msg.type === 'image' && msg.fileUrl && (
                        <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="block mb-1">
                          <img src={msg.fileUrl} alt={msg.fileName || 'Изображение'} loading="lazy" className="max-w-full max-h-80 rounded-lg object-contain" />
                        </a>
                      )}
                      {msg.type === 'voice' && msg.fileUrl && (
                        <div className="min-w-52 flex items-center gap-2 py-1"><AudioLines className="w-5 h-5 flex-shrink-0" /><audio controls preload="metadata" src={msg.fileUrl} className="max-w-full w-56" /></div>
                      )}
                      {msg.type === 'video-note' && msg.fileUrl && (
                        <video controls playsInline preload="metadata" src={msg.fileUrl} className="w-48 h-48 rounded-full object-cover bg-black" />
                      )}
                      {msg.type === 'file' && msg.fileUrl && (
                        <a href={msg.fileUrl} download={msg.fileName || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 min-w-44 p-2 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15">
                          <FileText className="w-8 h-8 flex-shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium break-all">{msg.fileName || 'Файл'}</span>
                            <span className="block text-xs opacity-70">{msg.fileSize ? `${Math.max(1, Math.round(msg.fileSize / 1024))} КБ` : 'Вложение'}</span>
                          </span>
                          <Download className="w-4 h-4 flex-shrink-0" />
                        </a>
                      )}
                      {msg.sender?.username && <div className="text-[11px] font-semibold mb-1 opacity-75">{msg.sender.username.toLowerCase() === 'okak' ? <span className="mr-1 rounded bg-amber-400/20 text-amber-500 px-1.5 py-0.5">ВЛАДЕЛЕЦ</span> : msg.sender.username.toLowerCase() === 'sladkiy' ? <span className="mr-1 rounded bg-violet-400/20 text-violet-500 px-1.5 py-0.5">МОДЕРАТОР</span> : null}{msg.sender.displayName || msg.sender.username}</div>}
                      {msg.content && <p className="text-[15px] whitespace-pre-wrap break-words">{msg.content}</p>}
                      {msg.editedAt && <span className="text-[10px] opacity-60">изменено</span>}
                      {localStorage.getItem('nova-once-' + msg.id) && <span className="block text-[10px] opacity-70">⏳ Одноразовое сообщение</span>}
                      {(isMine || isOwner || isModerator) && !msg.id.startsWith('c_') && <div className="flex gap-2 mt-1 text-[11px] opacity-70"><button type="button" className="hover:underline" onClick={() => { setEditingMessageId(msg.id); setEditDraft(msg.content || ''); setText(msg.content || ''); }}>Изменить</button><button type="button" className="hover:underline text-red-500" onClick={async () => { if (!confirm('Удалить сообщение?')) return; try { await api.deleteMessage(msg.id); useChatStore.setState((st) => ({ messages: { ...st.messages, [msg.chatId]: (st.messages[msg.chatId] || []).filter((m:any) => m.id !== msg.id) } })); } catch(e:any) { alert(e.message || 'Не удалось удалить сообщение'); } }}>Удалить</button></div>}
                      <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : ''}`}>
                        <span className={`text-[11px] ${isMine ? 'text-white/70' : 'text-gray-400'}`}>
                          {format(new Date(msg.createdAt), 'HH:mm')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="min-w-0 p-2 md:p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 relative">
              {showEmoji && (
                <div className="absolute bottom-16 left-3 p-2 rounded-xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 grid grid-cols-5 gap-1 z-20">
                  {EMOJIS.map((e) => (
                    <button key={e} type="button" className="text-2xl p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={() => setText((t) => t + e)}>{e}</button>
                  ))}
                </div>
              )}
              {recordingKind && <div className="flex items-center gap-3 text-sm text-red-500 px-2 pb-2 animate-pulse"><span>● Запись {recordingKind === 'voice' ? 'голосового' : 'видеокружка'} · {recordingSeconds} сек.</span>{recordingKind === 'video-note' && <video ref={recordingVideoRef} muted autoPlay playsInline className="w-12 h-12 rounded-full object-cover border-2 border-red-400" />}<span className="text-xs text-gray-500 animate-none">Нажми ■, чтобы отправить</span></div>}
              <div className="flex min-w-0 items-end gap-1.5 md:gap-2">
                <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.txt,.zip" onChange={onFile} />
                <button type="button" onClick={() => recordingKind ? stopMediaMessage() : startMediaMessage('voice')} title={recordingKind === 'voice' ? 'Остановить запись' : 'Записать голосовое'} className={`p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 ${recordingKind === 'voice' ? 'text-red-500' : 'text-gray-500'}`}>
                  {recordingKind === 'voice' ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button type="button" onClick={() => recordingKind ? stopMediaMessage() : startMediaMessage('video-note')} title={recordingKind === 'video-note' ? 'Остановить кружок' : 'Записать видеокружок'} className={`p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 ${recordingKind === 'video-note' ? 'text-red-500' : 'text-gray-500'}`}>
                  {recordingKind === 'video-note' ? <Square className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                  <Paperclip className="w-5 h-5" />
                </button>
                <div className="flex flex-col flex-1 min-w-0 gap-1"><div className="flex items-center gap-2 px-1">{editingMessageId && <span className="text-xs text-violet-500">Редактирование сообщения <button type="button" className="underline" onClick={() => { setEditingMessageId(null); setText(''); }}>Отмена</button></span>}<label className="text-xs text-gray-500 flex items-center gap-1 ml-auto"><input type="checkbox" checked={oneTimeMode} onChange={(e) => setOneTimeMode(e.target.checked)} /> Одноразовое</label></div><textarea
                  value={text}
                  onChange={(e) => handleTyping(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Сообщение..."
                  rows={1}
                  className="w-full min-w-0 px-3 md:px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 border-0 resize-none focus:ring-2 focus:ring-nova-500 outline-none text-[15px] max-h-32"
                /></div>
                <button type="button" onClick={() => setShowEmoji((v) => !v)} className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                  <Smile className="w-5 h-5" />
                </button>
                <button type="button" onClick={handleSend} disabled={!text.trim()} className="p-2.5 rounded-xl bg-nova-500 hover:bg-nova-600 text-white disabled:opacity-40">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {settingsOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setSettingsOpen(false)}>
          <section className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2"><Settings className="w-5 h-5"/><h2 className="font-semibold text-lg">Настройки</h2></div>
              <button type="button" onClick={() => setSettingsOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <p className="font-medium">Внешний вид</p>
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-3">Тема приложения</p>
                <button type="button" onClick={toggle} className="px-3 py-2 rounded-lg bg-nova-500 text-white flex items-center gap-2">{theme === 'dark' ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}{theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}</button>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 space-y-3">
                <p className="font-medium">Персонализация</p>
                <label className="flex items-center justify-between gap-3 text-sm"><span>Основной цвет интерфейса и надписей</span><input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-10 h-8 rounded cursor-pointer bg-transparent" /></label>
                <label className="block text-sm">Обои текущего чата (ссылка на изображение)<input value={chatWallpaper} onChange={(e) => { setChatWallpaper(e.target.value); if (currentChatId) localStorage.setItem('nova-wallpaper-' + currentChatId, e.target.value); }} placeholder="https://.../wallpaper.jpg" className="mt-1 w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-none" /></label>
                <button type="button" onClick={() => { setChatWallpaper(''); if (currentChatId) localStorage.removeItem('nova-wallpaper-' + currentChatId); }} className="text-xs text-violet-500 hover:underline">Сбросить обои чата</button>
                <p className="text-xs text-gray-500">Обои и цвет сохраняются в этом браузере.</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <p className="font-medium">Приватность и блокировки</p>
                <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">Заблокированные пользователи не отображаются в сообщениях на этом устройстве.</p>
                <div className="mt-3 space-y-2">
                  {blockedUserIds.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-300">Нет заблокированных пользователей.</p>}
                  {blockedUserIds.map((id) => { const u = chats.flatMap((c: any) => c.members || []).find((m: any) => m.id === id); return <div key={id} className="flex items-center gap-2 justify-between"><span className="text-sm truncate">{u?.displayName || u?.username || 'Пользователь'}</span><button type="button" onClick={() => setBlockedUserIds((ids) => ids.filter((x) => x !== id))} className="text-sm text-nova-500 hover:underline">Разблокировать</button></div>; })}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <p className="font-medium flex items-center gap-2"><ShieldCheck className="w-4 h-4"/>Права аккаунта</p>
                <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">{isOwner ? 'Владелец — полный доступ к модерации.' : isModerator ? 'Модератор — может банить пользователей, кроме владельца.' : 'Обычный пользователь — может блокировать собеседников.'}</p>
                {(isOwner || isModerator) && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Владелец: @okak · Модератор: @sladkiy</p>}
              </div>
            </div>
          </section>
        </div>
      )}

      {profileOpen && profileUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setProfileOpen(false)}>
          <section className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold">Профиль</h2>
              <button type="button" onClick={() => setProfileOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Закрыть"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <Avatar name={profileEditing ? profileDisplayName : (profileUser.displayName || '')} url={profileAvatarUrl} size={104} status={profileUser.status} />
                  {profileEditing && <button type="button" onClick={() => profileAvatarRef.current?.click()} disabled={profileBusy} title="Изменить аватарку" className="absolute bottom-0 right-0 p-2 rounded-full bg-nova-500 text-white shadow hover:bg-nova-600 disabled:opacity-50"><Camera className="w-4 h-4" /></button>}
                </div>
                <input ref={profileAvatarRef} type="file" accept="image/*" className="hidden" onChange={handleProfileAvatar} />
                {profileEditing ? (
                  <input value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} maxLength={64} placeholder="Имя" className="mt-4 w-full px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-nova-500 text-center" />
                ) : (
                  <h3 className="mt-4 text-xl font-bold break-words">{profileUser.displayName}</h3>
                )}
                <p className="mt-1 text-sm text-gray-500">@{profileUser.username}</p>
                <p className="mt-2 text-xs text-gray-500">{profileUser.status === 'online' ? 'В сети' : 'Не в сети'}</p>
              </div>
              <div className="mt-6">
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-2">О себе</p>
                {profileEditing ? (
                  <textarea value={profileBio} onChange={(e) => setProfileBio(e.target.value)} maxLength={300} rows={4} placeholder="Расскажи немного о себе..." className="w-full px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 outline-none resize-none focus:ring-2 focus:ring-nova-500 text-sm" />
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">{profileUser.bio?.trim() || 'Пока ничего не указано.'}</p>
                )}
                {profileEditing && <p className="text-xs text-gray-400 text-right mt-1">{profileBio.length}/300</p>}
              </div>
              {profileUser.id === user?.id && (
                <div className="mt-6 flex gap-2">
                  {profileEditing ? (
                    <>
                      <button type="button" disabled={profileBusy || !profileDisplayName.trim()} onClick={saveProfile} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-nova-500 hover:bg-nova-600 text-white font-medium disabled:opacity-50"><Save className="w-4 h-4" />{profileBusy ? 'Сохраняем...' : 'Сохранить'}</button>
                      <button type="button" disabled={profileBusy} onClick={() => { setProfileEditing(false); setProfileDisplayName(profileUser.displayName || ''); setProfileBio(profileUser.bio || ''); setProfileAvatarUrl(profileUser.avatarUrl || null); }} className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700">Отмена</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setProfileEditing(true)} className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-nova-500 hover:bg-nova-600 text-white font-medium"><Pencil className="w-4 h-4" />Редактировать профиль</button>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {callState !== 'idle' && (
        <div style={callMinimized && callPosition.x !== null ? { left: callPosition.x, top: callPosition.y, right: 'auto', bottom: 'auto', position: 'fixed' } : undefined} className={callMinimized ? "fixed bottom-4 right-4 z-50 w-72 rounded-2xl bg-gray-900 text-white shadow-2xl border border-white/15 overflow-hidden p-3" : "fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/95 text-white p-6"}>
          <div onPointerDown={(e) => { if (!callMinimized) return; const r = e.currentTarget.parentElement?.getBoundingClientRect(); if (r) callDragRef.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top }; }} className="flex items-center justify-between w-full max-w-lg mb-2 cursor-grab active:cursor-grabbing">
            <div className="min-w-0"><p className="text-lg font-semibold truncate">{callPeer?.name}</p><p className="text-xs text-white/60">{callState === 'calling' ? 'Вызов…' : callState === 'incoming' ? 'Входящий звонок' : callState === 'connecting' ? 'Соединение…' : (callVideo ? 'Видеозвонок' : 'Разговор')}</p></div>
            <button type="button" onClick={() => setCallMinimized((v) => !v)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20" title={callMinimized ? 'Развернуть звонок' : 'Свернуть звонок и открыть чат'}>{callMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-5 h-5" />}</button>
          </div>
          {!callMinimized && <><p className="text-2xl font-semibold mb-2">{callPeer?.name}</p>{callError && <p className="text-amber-400 text-sm mb-4">{callError}</p>}<p className="text-[11px] text-white/60 mb-3 text-center max-w-lg break-words">WebRTC: {rtcDebug.pc} · ICE: {rtcDebug.ice}<br />Локально: {rtcDebug.local}<br />От собеседника: {rtcDebug.remote}<br />{rtcDebug.relay}</p></>}
          <div className={`relative bg-black overflow-hidden ${callMinimized ? 'w-full aspect-video rounded-xl mb-2' : 'w-full max-w-lg aspect-video rounded-2xl mb-6'}`}>
            <video ref={remoteVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
            {callVideo && <video ref={localVideoRef} autoPlay playsInline muted className={`absolute bottom-2 right-2 object-cover rounded-lg border border-white/30 bg-gray-800 ${callMinimized ? 'w-16 h-12' : 'w-28 h-20'}`} />}
            {!callVideo && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80"><Avatar name={callPeer?.name || 'Абонент'} url={chats.flatMap((c:any) => c.members || []).find((m:any) => m.id === callPeer?.id)?.avatarUrl} size={callMinimized ? 58 : 112} /><span className="font-semibold">{callPeer?.name || 'Абонент'}</span>{callState !== 'active' && <span className="text-xs text-white/60">{callState === 'calling' ? 'Ожидание ответа...' : callState === 'incoming' ? 'Входящий вызов' : 'Подключение...'}</span>}</div>}
          </div>
          {!callMinimized && audioPlaybackBlocked && callState !== 'incoming' && <button type="button" onClick={enableRemoteAudio} className="mb-4 px-5 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-black font-medium">Включить звук собеседника</button>}
          <div className={`flex items-center ${callMinimized ? 'justify-center gap-3' : 'gap-4'}`}>
            {callState === 'incoming' && <><button type="button" onClick={acceptCall} className="px-5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 font-medium">Принять</button><button type="button" onClick={rejectCall} className="px-5 py-2 rounded-full bg-red-500 hover:bg-red-600 font-medium">Отклонить</button></>}
            {(callState === 'calling' || callState === 'connecting' || callState === 'active') && <><button type="button" onClick={toggleMic} className="p-3 rounded-full bg-white/10 hover:bg-white/20" title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}>{micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}</button>{callVideo && !callMinimized && <button type="button" onClick={toggleCam} className="p-3 rounded-full bg-white/10 hover:bg-white/20">{camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}</button>}<button type="button" onClick={() => cleanupCall(true)} className="p-3 rounded-full bg-red-500 hover:bg-red-600" title="Завершить звонок"><PhoneOff className="w-5 h-5" /></button></>}
          </div>
          {!callMinimized && <p className="mt-4 text-sm text-white/50 text-center max-w-md">Оба должны быть онлайн. Разрешите микрофон{callVideo ? ' и камеру' : ''} в браузере. Для звонков из разных сетей обычно нужен TURN-сервер.</p>}
        </div>
      )}

      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowNewChat(false); setGroupMode(false); setGroupSelected([]); setGroupName(''); setUserSearch(''); }}>
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{groupMode ? 'Новая группа' : 'Новый чат'}</h2>
              <button type="button" onClick={() => { setShowNewChat(false); setGroupMode(false); setGroupSelected([]); setGroupName(''); }}><X className="w-5 h-5" /></button>
            </div>

            <div className="flex gap-2 mb-3">
              <button type="button" onClick={() => { setGroupMode(false); setGroupSelected([]); setGroupName(''); }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium ${!groupMode ? 'bg-nova-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}>
                Личный
              </button>
              <button type="button" onClick={() => setGroupMode(true)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium ${groupMode ? 'bg-nova-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}>
                Группа
              </button>
            </div>

            {groupMode && (
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Название группы"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 border-0 focus:ring-2 focus:ring-nova-500 outline-none mb-2"
              />
            )}

            {groupMode && groupSelected.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {groupSelected.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-nova-100 dark:bg-nova-900 text-sm">
                    {u.displayName}
                    <button type="button" className="text-gray-500 hover:text-red-500" onClick={() => setGroupSelected((s) => s.filter((x) => x.id !== u.id))}>×</button>
                  </span>
                ))}
              </div>
            )}

            <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Поиск пользователей..." className="w-full px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 border-0 focus:ring-2 focus:ring-nova-500 outline-none mb-3" autoFocus />

            <div className="max-h-52 overflow-y-auto space-y-1 mb-3">
              {searchResults.map((u) => {
                const selected = groupSelected.some((s) => s.id === u.id);
                return (
                  <div key={u.id} className={`w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 ${selected ? 'bg-nova-50 dark:bg-nova-950/40' : ''}`}>
                    <button type="button" onClick={() => openProfile(u)} title="Открыть профиль" className="flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-nova-500">
                      <Avatar name={u.displayName} url={u.avatarUrl} status={u.status} size={36} />
                    </button>
                    <button type="button" className="flex-1 min-w-0 text-left" onClick={() => {
                      if (groupMode) {
                        setGroupSelected((s) => selected ? s.filter((x) => x.id !== u.id) : [...s, { id: u.id, displayName: u.displayName, username: u.username }]);
                      } else {
                        startChat(u.id);
                      }
                    }}>
                      <p className="font-medium truncate">{u.displayName}</p>
                      <p className="text-xs text-gray-500 truncate">@{u.username}</p>
                    </button>
                    {!groupMode && <button type="button" onClick={() => startChat(u.id)} title="Написать сообщение" className="p-2 rounded-lg text-gray-500 hover:text-nova-500"><MessageCircle className="w-4 h-4" /></button>}
                    {groupMode && selected && <span className="text-nova-500 text-sm">✓</span>}
                  </div>
                );
              })}
              {userSearch && searchResults.length === 0 && <p className="text-center text-sm text-gray-400 py-4">Никого не найдено</p>}
            </div>

            {groupMode && (
              <button
                type="button"
                disabled={!groupName.trim() || groupSelected.length < 1}
                onClick={async () => {
                  try {
                    const chat = await createGroup(groupName.trim(), groupSelected.map((u) => u.id));
                    selectChat(chat.id);
                    setShowNewChat(false);
                    setGroupMode(false);
                    setGroupSelected([]);
                    setGroupName('');
                    setUserSearch('');
                    setMobileShowChat(true);
                  } catch (e: any) {
                    alert(e.message || 'Не удалось создать группу');
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-nova-500 hover:bg-nova-600 text-white font-medium disabled:opacity-40"
              >
                Создать группу ({groupSelected.length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

