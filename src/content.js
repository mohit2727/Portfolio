// Portfolio content, taken from Mohit's resume. Each section lives in one landmark tower.
// `block` is the tower's grid position (see config.js), `height` its height in metres.

export const PROFILE = {
  name: 'Mohit Acharya',
  role: 'Full stack developer · MERN + TypeScript',
  email: 'mohitacharya2727@gmail.com',
  github: 'https://github.com/mohit2727',
  linkedin: 'https://linkedin.com/in/mohit-acharya-7080a9246',
  location: 'Jodhpur, Rajasthan',
};

const chips = (list) => `<ul class="chips">${list.map((t) => `<li>${t}</li>`).join('')}</ul>`;

export const SECTIONS = [
  {
    id: 'origin',
    name: 'Origin',
    label: 'About me',
    color: '#e3262f',
    block: [16, 16],
    height: 330,
    html: `
      <p class="caption">Every hero has an origin story. Mine starts in Jodhpur with a commerce degree and a laptop full of side projects.</p>
      <p>I'm Mohit Acharya, a full stack developer working with the MERN stack and TypeScript. I build production web apps end to end: REST APIs, authentication, payments, and AI features powered by LLMs.</p>
      <p>I switched from commerce to computer applications, finished my MCA with a 9.24 CGPA, and now ship real products as a Junior Software Engineer at Apptheka Solutions.</p>
      <dl class="facts">
        <div><dt>Base</dt><dd>Jodhpur, Rajasthan</dd></div>
        <div><dt>Now</dt><dd>Junior Software Engineer, Apptheka</dd></div>
        <div><dt>Stack</dt><dd>MERN · TypeScript · Next.js</dd></div>
        <div><dt>Education</dt><dd>MCA 2026 · CGPA 9.24</dd></div>
      </dl>`,
  },
  {
    id: 'missions',
    name: 'Missions',
    label: 'Projects',
    color: '#ffd23f',
    block: [10, 21],
    height: 300,
    html: `
      <p class="caption">Case files from the city's most wanted builds.</p>
      <article class="card">
        <h3>EdTech Learning &amp; Test Platform</h3>
        <p>A multi-panel learning and test-series platform: a student Android app, a web panel, an admin dashboard and a central API server. Admins run quizzes, courses, video playlists and announcements. Students take timed tests and track their scores.</p>
        ${chips(['TypeScript', 'Node.js', 'Express', 'MongoDB'])}
        <a class="card-link" href="https://github.com/mohit2727/Edtech-Platform" target="_blank" rel="noopener">View on GitHub →</a>
      </article>
      <article class="card">
        <h3>Virtual Interview Bot <span class="badge">In progress</span></h3>
        <p>Interview practice with an AI. Gemini generates role-based questions, then scores each answer and gives feedback.</p>
        ${chips(['React', 'Node.js', 'Gemini API'])}
        <a class="card-link" href="https://github.com/mohit2727/ai-interview-bot" target="_blank" rel="noopener">View on GitHub →</a>
      </article>
      <article class="card">
        <h3>Social Media Caption Generator</h3>
        <p>Type a few keywords and pick a tone. Gemini returns caption variations that match the theme.</p>
        ${chips(['React', 'Node.js', 'Gemini API'])}
        <a class="card-link" href="https://github.com/mohit2727" target="_blank" rel="noopener">More on GitHub →</a>
      </article>
      <article class="card">
        <h3>HRM System <span class="badge">Microlent internship</span></h3>
        <p>Employee records, attendance and HR workflows with role-based access control. Centralising attendance cut manual HR work by about 40%.</p>
        ${chips(['MongoDB', 'Express', 'React', 'Node.js', 'JWT + RBAC'])}
      </article>`,
  },
  {
    id: 'powers',
    name: 'Powers',
    label: 'Skills',
    color: '#36c5f0',
    block: [21, 22],
    height: 285,
    html: `
      <p class="caption">With great stacks comes great responsibility.</p>
      <div class="power"><h3>Languages</h3>${chips(['JavaScript', 'TypeScript', 'Java', 'SQL'])}</div>
      <div class="power"><h3>Frontend</h3>${chips(['React.js', 'Next.js', 'Tailwind CSS', 'HTML5 &amp; CSS3', 'Vite'])}</div>
      <div class="power"><h3>Backend &amp; architecture</h3>${chips(['Node.js', 'Express.js', 'Spring Boot', 'MVC / Clean Architecture', 'Microservices'])}</div>
      <div class="power"><h3>Databases</h3>${chips(['MongoDB (Atlas, Mongoose)', 'PostgreSQL', 'MySQL'])}</div>
      <div class="power"><h3>DevOps &amp; tools</h3>${chips(['Docker', 'Firebase', 'VPS deployment', 'Vercel', 'Render', 'Git &amp; GitHub', 'Postman'])}</div>
      <div class="power"><h3>Integrations &amp; AI</h3>${chips(['Razorpay', 'Stripe', 'WhatsApp Cloud API', 'MSG91', 'Firebase Auth', 'Gemini API / LLMs'])}</div>`,
  },
  {
    id: 'timeline',
    name: 'Timeline',
    label: 'Experience',
    color: '#9b6bff',
    block: [22, 10],
    height: 305,
    html: `
      <p class="caption">Patrol log, newest first.</p>
      <ol class="timeline">
        <li>
          <span class="when">Feb 2026 – now</span>
          <h3>Junior Software Engineer</h3>
          <p class="where">Apptheka Solutions Pvt. Ltd. · Jodhpur</p>
          <ul>
            <li>Builds and maintains production web apps with React, Next.js (TypeScript), Node/Express and MongoDB/PostgreSQL.</li>
            <li>Secures REST APIs with JWT + bcrypt, following MVC and clean-architecture patterns.</li>
            <li>Integrates Razorpay, WhatsApp Cloud API, Twilio/MSG91 and Gemini-powered AI features into live apps.</li>
            <li>Ships Docker containers to VPS, and releases on Vercel and Render.</li>
          </ul>
        </li>
        <li>
          <span class="when">Jun 2025 – Aug 2025</span>
          <h3>Full Stack Developer Intern</h3>
          <p class="where">Microlent Solutions Pvt. Ltd. · Jodhpur</p>
          <ul>
            <li>Built a MERN HRM system for employee records, attendance and HR workflows.</li>
            <li>Added role-based access control with JWT, and documented the APIs in Postman.</li>
            <li>Cut manual attendance effort by about 40%.</li>
          </ul>
        </li>
        <li>
          <span class="when">Aug 2024 – Jul 2026</span>
          <h3>Master of Computer Applications</h3>
          <p class="where">Lachoo Memorial College of Science &amp; Technology · CGPA 9.24</p>
        </li>
        <li>
          <span class="when">Aug 2021 – Jun 2024</span>
          <h3>Bachelor of Commerce</h3>
          <p class="where">Jai Narain Vyas University · Jodhpur</p>
        </li>
      </ol>`,
  },
  {
    id: 'signal',
    name: 'Signal',
    label: 'Contact',
    color: '#2ee59d',
    block: [11, 9],
    height: 275,
    html: `
      <p class="caption">Need a full stack developer? Light up the signal.</p>
      <p>Send me an email about a role, a freelance build or an idea you want to ship.</p>
      <div class="email-box">
        <span class="email" id="email-text">mohitacharya2727@gmail.com</span>
        <button class="copy-btn" data-copy="mohitacharya2727@gmail.com">Copy</button>
      </div>
      <ul class="links">
        <li><a href="mailto:mohitacharya2727@gmail.com">Write an email</a></li>
        <li><a href="https://github.com/mohit2727" target="_blank" rel="noopener">GitHub · mohit2727</a></li>
        <li><a href="https://linkedin.com/in/mohit-acharya-7080a9246" target="_blank" rel="noopener">LinkedIn · Mohit Acharya</a></li>
      </ul>
      <p class="where">Based in Jodhpur, Rajasthan.</p>`,
  },
];
