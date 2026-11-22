import { AgentState, BrowserAudioInterface, ConversationAgent, InteractionType, RateLimitError } from '/sdk/browser.js';

const POLL_MS = 1000;
const CONNECT_TIMEOUT_S = 15;
const $ = (id) => document.getElementById(id);
const [button, status, transcript, cards] = ['talk', 'status', 'transcript', 'cards'].map($);

let call = null; // { agent, session, timer, mic }

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};

function setButton(state, text) {
  button.dataset.state = state;
  button.textContent = { idle: 'Talk', busy: 'Cancel', live: 'End' }[state];
  document.body.classList.toggle('in-call', state !== 'idle');
  if (text) status.textContent = text;
}

// Partial transcripts differ in closing punctuation: "हाँ।" then "हाँ, बुक कर दीजिए।"
const bare = (s) => s.replace(/[\s.,!?।]/g, '');

function showTranscript({ role, content }) {
  if (!content?.trim()) return;
  const who = role === 'user' ? 'user' : 'bot';
  const last = transcript.lastElementChild;
  // Streaming updates repeat the text so far.
  if (last?.className === who && bare(content).startsWith(bare(last.textContent))) last.textContent = content;
  else transcript.append(el('li', content, who));
  transcript.lastElementChild.scrollIntoView({ block: 'nearest' });
}

function card({ type, result }) {
  if (!result.ok) return null;
  const box = el('article', '', `card ${type}`);
  if (type === 'showroom') {
    box.append(
      el('h2', `Nearest showroom: ${result.showroom}`),
      el('p', result.address),
      el('p', `About ${result.distance_km} km in a straight line`, 'meta'),
    );
  } else if (type === 'booking') {
    const b = result.booking;
    const when = new Date(`${b.date}T${b.time}:00`).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' });
    box.append(
      el('span', 'MOCK BOOKING', 'badge'),
      el('h2', `Ather ${b.vehicle} test ride`),
      el('p', when),
      el('p', `${b.showroom}: ${b.address}`),
      el('p', `Reference ${b.reference}. Saved for this demo only, not sent to Ather.`, 'meta'),
    );
  } else {
    box.append(el('h2', result.searched ? 'Claude searched the web' : 'Answered by Claude'), el('p', result.say));
    for (const { url, title } of result.sources ?? []) {
      if (!/^https?:\/\//.test(url)) continue;
      const link = el('a', title);
      Object.assign(link, { href: url, target: '_blank', rel: 'noreferrer' });
      box.append(link);
    }
  }
  return box;
}

async function poll(session) {
  try {
    const response = await fetch(`/api/session/${session}`);
    if (!response.ok) return;
    const events = await response.json();
    cards.replaceChildren(...events.map(card).filter(Boolean).reverse());
  } catch { /* the next poll retries */ }
}

async function hangUp(text = 'Call ended. Tap Talk to start again.') {
  const ending = call;
  if (!ending) return;
  call = null; // Cleared first: agent.stop() fires endCallback, which calls back into here.
  clearInterval(ending.timer);
  ending.mic?.getTracks().forEach((track) => track.stop());
  setButton('idle', text);
  void poll(ending.session);
  await ending.agent?.stop().catch(() => {});
}

async function start() {
  const session = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
  const mine = { session };
  call = mine;
  setButton('busy', 'Allow the microphone…');
  transcript.replaceChildren();
  cards.replaceChildren();

  try {
    // Ask inside the tap. iPhone Safari allows playback while the microphone is live,
    // and the SDK only creates its audio contexts later, outside the tap.
    mine.mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (call !== mine) return mine.mic.getTracks().forEach((track) => track.stop());
    status.textContent = 'Connecting…';

    mine.agent = new ConversationAgent({
      apiKey: '', // The server adds the key.
      baseUrl: '/api/sarvam/',
      config: {
        org_id: '_', // Filled in by the server.
        workspace_id: '_',
        app_id: '_',
        user_identifier: session,
        user_identifier_type: 'custom',
        interaction_type: InteractionType.CALL,
        input_sample_rate: 16000,
        output_sample_rate: 16000,
        agent_variables: { session_id: session },
      },
      audioInterface: new BrowserAudioInterface(),
      transcriptCallback: async (message) => showTranscript(message),
      stateCallback: (state) => {
        if (call !== mine) return;
        if (state === AgentState.LISTENING) setButton('live', 'Listening…');
        if (state === AgentState.SPEAKING) setButton('live', 'Speaking…');
        if (state === AgentState.ERROR) void hangUp('The call dropped. Tap Talk to try again.');
      },
      endCallback: async () => {
        if (call === mine) await hangUp();
      },
    });

    await mine.agent.start();
    const connected = await mine.agent.waitForConnect(CONNECT_TIMEOUT_S);
    if (call !== mine) return void (await mine.agent.stop().catch(() => {}));
    if (!connected) throw new Error('Connection timed out');
    setButton('live', 'Connected. Start speaking.');
    mine.timer = setInterval(() => poll(session), POLL_MS);
  } catch (error) {
    console.error(error);
    if (call !== mine) return;
    let message = `Could not start the call: ${error.message}`;
    if (error.name === 'NotAllowedError') message = 'Microphone is blocked. Allow it in your browser settings, then tap Talk.';
    if (error instanceof RateLimitError) message = 'This demo has used up its calls, or is busy. Please ask the presenter.';
    await hangUp(message);
  }
}

button.addEventListener('click', () => (call ? hangUp() : start()));

const { ready } = await fetch('/api/config').then((r) => r.json());
if (!ready) {
  button.disabled = true;
  status.textContent = 'The agent has not been published yet.';
}
