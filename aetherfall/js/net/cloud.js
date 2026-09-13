/* Supabase 연동. 로그인, 클라우드 저장, 순위표를 담당한다.
   연결이 안 되어도 게임은 그대로 돌아가고, 저장만 기기 안에 남는다. */

export const CONFIG = {
  SUPABASE_URL: 'https://dbneonomwrqwlbitwdtr.supabase.co',
  SUPABASE_KEY: 'sb_publishable_Smg0o4U5qYTkrLygwhVUSA_YM7HwKjM',
};

const listeners = new Set();

export const cloud = {
  sb: null,
  user: null,
  profile: null,
  available: false,
  status: 'guest',      // guest | signedIn | offline

  init() {
    if (this.sb) return this.available;
    const lib = window.supabase;
    if (!lib || !lib.createClient) {
      this.status = 'offline';
      return false;
    }
    this.sb = lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
    this.available = true;
    this.sb.auth.onAuthStateChange((_event, session) => {
      this.user = session?.user || null;
      this.status = this.user ? 'signedIn' : 'guest';
      emit();
    });
    return true;
  },

  async restore() {
    if (!this.available) return null;
    try {
      const { data } = await this.sb.auth.getSession();
      this.user = data?.session?.user || null;
      this.status = this.user ? 'signedIn' : 'guest';
      /* 로그인 직후 주소창에 남는 토큰 조각을 지운다. */
      if (location.hash.includes('access_token') || location.search.includes('code=')) {
        history.replaceState(null, '', location.pathname);
      }
      emit();
      return this.user;
    } catch (e) {
      this.status = 'offline';
      return null;
    }
  },

  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  displayName() {
    const meta = this.user?.user_metadata || {};
    return (meta.full_name || meta.name || (this.user?.email || '').split('@')[0] || '강림자').slice(0, 20);
  },

  avatar() {
    const meta = this.user?.user_metadata || {};
    const url = meta.avatar_url || meta.picture || '';
    return typeof url === 'string' && url.startsWith('https://') ? url : '';
  },

  async signInGoogle() {
    if (!this.available) throw new Error('연결할 수 없습니다.');
    if (location.protocol === 'file:') {
      throw new Error('구글 로그인은 http 또는 https 주소에서만 됩니다.');
    }
    const { error } = await this.sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
  },

  async signOut() {
    if (!this.available) return;
    await this.sb.auth.signOut();
    this.user = null;
    this.profile = null;
    this.status = 'guest';
    emit();
  },

  async touchProfile() {
    if (!this.user) return null;
    const { data, error } = await this.sb.rpc('af_touch_profile', {
      p_nickname: this.displayName(),
      p_avatar: this.avatar() || null,
    });
    if (error) return null;
    this.profile = data;
    return data;
  },

  async pullSave() {
    if (!this.user) return null;
    const { data, error } = await this.sb
      .from('af_saves')
      .select('payload, revision, updated_at')
      .eq('user_id', this.user.id)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  },

  async pushSave(save, revision) {
    if (!this.user) return false;
    const { error } = await this.sb
      .from('af_saves')
      .upsert({
        user_id: this.user.id,
        payload: save,
        revision,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    return !error;
  },

  async submitRun(summary) {
    if (!this.user) return { ok: false, reason: 'guest' };
    const { error } = await this.sb.rpc('af_submit_run', {
      p_class: summary.classId,
      p_depth: summary.floor,
      p_level: summary.level,
      p_kills: summary.kills,
      p_damage: Math.min(2000000000, summary.damage),
      p_duration: Math.max(5, summary.duration),
      p_cleared: summary.bosses > 0,
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  },

  async leaderboard(limit = 50) {
    if (!this.available) return [];
    const { data, error } = await this.sb.rpc('af_leaderboard', { p_limit: limit });
    if (error) return [];
    return data || [];
  },
};

function emit() {
  for (const fn of listeners) {
    try { fn(cloud); } catch (e) { /* 듣는 쪽 문제로 게임이 멈추면 안 된다 */ }
  }
}
