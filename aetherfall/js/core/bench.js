/* 기기 사양을 재서 권장 사양과 견줘 본다.
   브라우저가 알려주는 값에는 한계가 있어 결과는 어디까지나 추정이다.
   못 재는 항목은 '확인 불가' 로 두고 막지 않는다. */

export const REQUIREMENT = {
  ram: 7,          // GB
  storage: 256,    // GB
  single: 1300,    // 싱글코어 추정 점수
};

/* 부동소수 위주의 연산. 한 번 도는 데 드는 비용이 기기별로 잘 갈린다. */
function floatWork(n) {
  let a = 0, b = 1.000001;
  for (let i = 0; i < n; i++) {
    b = b * 1.0000003 + 0.0000007;
    if (b > 4) b -= 3;
    a += Math.sqrt(b) + Math.sin(i * 0.0013) * Math.cos(i * 0.0007);
  }
  return a;
}

/* 정수·메모리 접근 위주. 캐시가 작은 기기에서 점수가 내려간다. */
function intWork(n, buf) {
  let h = 2166136261;
  for (let i = 0; i < n; i++) {
    const idx = (Math.imul(i, 2654435761) >>> 20) & 1023;
    buf[idx] = (buf[idx] + i) | 0;
    h = Math.imul(h ^ buf[idx], 16777619);
  }
  return h;
}

function measure(fn, budgetMs) {
  let n = 20000;
  /* 먼저 몇 번 돌려 JIT 를 데운다. 이걸 빼면 점수가 실제보다 낮게 나온다. */
  fn(n);
  fn(n);
  const start = performance.now();
  let iterations = 0;
  let elapsed = 0;
  while (elapsed < budgetMs) {
    fn(n);
    iterations += n;
    elapsed = performance.now() - start;
    if (elapsed < budgetMs * 0.4) n *= 2;
  }
  return iterations / (elapsed / 1000);
}

/* 두 결과를 섞어 하나의 점수로 만든다.
   나눗값은 데스크톱과 휴대폰 여러 대에서 맞춰 본 상수라 절대적인 값은 아니다.
   정수 연산은 브라우저마다 최적화 편차가 커서 비중을 낮게 뒀다. */
export function cpuScore() {
  const buf = new Int32Array(1024);
  const fps = measure(floatWork, 110);
  const ips = measure((n) => intWork(n, buf), 110);
  const score = (fps / 25000) * 0.75 + (ips / 390000) * 0.25;
  return Math.round(score);
}

export async function storageInfo() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    if (!est || !est.quota) return null;
    const quotaGb = est.quota / (1024 ** 3);
    /* 크로미움은 남은 디스크의 약 60% 를 할당량으로 준다. 거꾸로 되짚어 본다. */
    return { quotaGb, estimatedFreeGb: quotaGb / 0.6 };
  } catch (e) {
    return null;
  }
}

export function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return name || null;
  } catch (e) {
    return null;
  }
}

export function refreshRate() {
  return new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      if (frames < 24) requestAnimationFrame(tick);
      else resolve(Math.round(frames / ((performance.now() - t0) / 1000)));
    };
    requestAnimationFrame(tick);
  });
}

export async function runDiagnostics() {
  const ram = navigator.deviceMemory || null;   // 크로미움 계열만, 8GB 에서 값이 멈춘다
  const cores = navigator.hardwareConcurrency || null;
  const storage = await storageInfo();
  const hz = await refreshRate();
  /* 무거운 측정은 화면이 한 번 그려진 다음에 돌린다. */
  await new Promise((r) => setTimeout(r, 30));
  const single = cpuScore();

  const rows = [
    {
      key: 'ram',
      label: '메모리',
      want: `${REQUIREMENT.ram}GB 이상`,
      got: ram ? (ram >= 8 ? '8GB 이상' : `약 ${ram}GB`) : '확인 불가',
      pass: ram === null ? null : ram >= REQUIREMENT.ram,
      note: ram === null ? '이 브라우저는 메모리 용량을 알려주지 않습니다.' : '',
    },
    {
      key: 'storage',
      label: '저장 공간',
      want: `${REQUIREMENT.storage}GB 이상`,
      got: storage ? `여유 약 ${Math.round(storage.estimatedFreeGb)}GB` : '확인 불가',
      pass: storage === null ? null : storage.estimatedFreeGb >= 24,
      note: '브라우저는 전체 용량 대신 쓸 수 있는 몫만 알려줍니다. 이 게임 자체는 10MB 아래입니다.',
    },
    {
      key: 'single',
      label: '싱글코어 성능',
      want: `${REQUIREMENT.single}점 이상`,
      got: `약 ${single}점`,
      pass: single >= REQUIREMENT.single,
      note: '브라우저에서 직접 잰 추정치라 벤치마크 앱 점수와는 차이가 납니다.',
    },
    {
      key: 'cores',
      label: '논리 코어',
      want: '4개 이상',
      got: cores ? `${cores}개` : '확인 불가',
      pass: cores === null ? null : cores >= 4,
      note: '',
    },
    {
      key: 'display',
      label: '화면 주사율',
      want: '60Hz 이상',
      got: `${hz}Hz`,
      pass: hz >= 55,
      note: '',
    },
  ];

  const gpu = gpuName();
  if (gpu) rows.push({ key: 'gpu', label: '그래픽', want: '—', got: gpu, pass: null, note: '' });

  /* 측정 결과로 처음 품질을 정한다. 나중에 설정에서 바꿀 수 있다. */
  let quality = 'medium';
  if (single >= 2200 && (ram === null || ram >= 8)) quality = 'ultra';
  else if (single >= 1300) quality = 'high';
  else if (single >= 700) quality = 'medium';
  else quality = 'low';

  const failed = rows.filter((r) => r.pass === false).map((r) => r.key);
  return { rows, quality, single, ram, cores, hz, gpu, failed, meets: failed.length === 0 };
}
