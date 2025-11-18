const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cookieParser = require('cookie-parser');

const app = express();
const db = new sqlite3.Database('./db.sqlite');
const JWT_SECRET = 'your-secret-key';

// Middleware Setup
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads/documents', express.static(path.join(__dirname, 'uploads/documents')));
app.use('/uploads/submissions', express.static(path.join(__dirname, 'uploads/submissions')));

// SQLite Tables Setup
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT CHECK(role IN ('teacher','student'))
    )`);

  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      teacher_id INTEGER,
      title TEXT,
      file_path TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(teacher_id) REFERENCES users(id)
    )`);

  db.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY,
      teacher_id INTEGER,
      youtube_id TEXT,
      title TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(teacher_id) REFERENCES users(id)
    )`);

  db.run(`
    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY,
      teacher_id INTEGER,
      title TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(teacher_id) REFERENCES users(id)
    )`);

  db.run(`
    CREATE TABLE IF NOT EXISTS test_submissions (
      id INTEGER PRIMARY KEY,
      test_id INTEGER,
      student_id INTEGER,
      file_path TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      grade TEXT,
      feedback TEXT,
      graded_at DATETIME,
      FOREIGN KEY(test_id) REFERENCES tests(id),
      FOREIGN KEY(student_id) REFERENCES users(id)
    )`);
});

// Utility (DB Promises)
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}
function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Auth Middleware
app.use((req, res, next) => {
  const token = req.cookies.token;
  try {
    req.user = token ? jwt.verify(token, JWT_SECRET) : null;
  } catch {
    req.user = null;
  }
  next();
});

function requireLogin(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

// ─── AUTH ROUTES ──────────────────────────────────────
app.get('/', (req, res) => res.render('landing', { title: 'Landing Page', user: req.user }));

app.get('/signup', (req, res) => res.render('signup', { title: 'Sign Up', user: null }));

app.post('/signup', async (req, res) => {
  const { email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await runAsync('INSERT INTO users(email, password_hash, role) VALUES(?,?,?)', [email, hash, role]);
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.send('Error creating account');
  }
});

app.get('/login', (req, res) => res.render('login', { title: 'Login', user: null }));

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await getAsync('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.send('Invalid credentials');
  }
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
  res.cookie('token', token, { httpOnly: true });
  res.redirect(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

// ─── DASHBOARDS ──────────────────────────────────────
app.get('/teacher/dashboard', requireLogin, async (req, res) => {
  if (req.user.role !== 'teacher') return res.send('Forbidden');
  const docs = await allAsync('SELECT * FROM documents WHERE teacher_id = ?', [req.user.id]);
  const vids = await allAsync('SELECT * FROM videos WHERE teacher_id = ?', [req.user.id]);
  const tests = await allAsync('SELECT * FROM tests WHERE teacher_id = ?', [req.user.id]);
  res.render('dashboard_teacher', { user: req.user, docs, vids, tests });
});

app.get('/student/dashboard', requireLogin, async (req, res) => {
  if (req.user.role !== 'student') return res.send('Forbidden');
  const docs = await allAsync('SELECT * FROM documents');
  const vids = await allAsync('SELECT * FROM videos');
  const tests = await allAsync('SELECT * FROM tests');
  res.render('dashboard_student', { user: req.user, docs, vids, tests });
});

// ─── DOCUMENTS ──────────────────────────────────────
const docUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/documents'),
    filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
  })
});

app.get('/teacher/documents/upload', requireLogin, (req, res) => {
  if (req.user.role !== 'teacher') return res.send('Forbidden');
  res.render('upload_document', { user: req.user });
});

app.post('/teacher/documents/upload', requireLogin, docUpload.single('docfile'), async (req, res) => {
  const { title, link } = req.body;
  const filePath = req.file ? req.file.filename : null;

  if (!filePath && !link) {
    return res.send('Please upload a file or provide a link.');
  }

  await runAsync(
    'INSERT INTO documents (teacher_id, title, file_path, link, uploaded_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [req.user.id, title, filePath, link]
  );

  res.redirect('/teacher/dashboard');
});


app.get('/documents', requireLogin, async (req, res) => {
  const docs = await allAsync('SELECT d.*, u.email AS teacher_email FROM documents d JOIN users u ON d.teacher_id = u.id');
  res.render('documents', { user: req.user, docs });
});

// ─── VIDEOS ──────────────────────────────────────
app.get('/teacher/videos/upload', requireLogin, (req, res) => {
  if (req.user.role !== 'teacher') return res.send('Forbidden');
  res.render('upload_video', { user: req.user });
});

app.post('/teacher/videos/upload', requireLogin, async (req, res) => {
  const { youtube_url, title } = req.body;
  const match = youtube_url.match(/[?&]v=([A-Za-z0-9_-]{11})|youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (!match) return res.send('Invalid YouTube URL');
  const youtube_id = match[1] || match[2];
  await runAsync('INSERT INTO videos(teacher_id, youtube_id, title) VALUES(?,?,?)', [req.user.id, youtube_id, title]);
  res.redirect('/teacher/dashboard');
});

app.get('/videos', requireLogin, async (req, res) => {
  const vids = await allAsync('SELECT v.*, u.email AS teacher_email FROM videos v JOIN users u ON v.teacher_id = u.id');
  res.render('videos', { user: req.user, vids });
});

// ─── TESTS ──────────────────────────────────────
const subUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/submissions'),
    filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
  })
});

// Teacher creates tests
app.get('/teacher/tests/create', requireLogin, (req, res) => {
  if (req.user.role !== 'teacher') return res.send('Forbidden');
  res.render('create_test', { user: req.user });
});
app.post('/teacher/tests/create', requireLogin, async (req, res) => {
  const { title, description } = req.body;
  await runAsync('INSERT INTO tests(teacher_id, title, description) VALUES(?,?,?)', [req.user.id, title, description]);
  res.redirect('/teacher/dashboard');
});

// Teacher views test submissions
app.get('/teacher/tests/:testId/submissions', requireLogin, async (req, res) => {
  const { testId } = req.params;
  const test = await getAsync('SELECT * FROM tests WHERE id = ? AND teacher_id = ?', [testId, req.user.id]);
  if (!test) return res.send('Forbidden');
  const submissions = await allAsync(`
    SELECT s.*, u.email AS student_email 
    FROM test_submissions s JOIN users u ON s.student_id = u.id 
    WHERE s.test_id = ?`, [testId]);
  res.render('view_submissions', { user: req.user, test, submissions });
});

// Teacher grades a test
app.post('/teacher/tests/:testId/grade/:submissionId', requireLogin, async (req, res) => {
  const { testId, submissionId } = req.params;
  const { grade, feedback } = req.body;
  await runAsync(`
    UPDATE test_submissions 
    SET grade = ?, feedback = ?, graded_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND test_id = ?`, [grade, feedback, submissionId, testId]);
  res.redirect(`/teacher/tests/${testId}/submissions`);
});

// Student views & submits test
app.get('/student/tests/:testId', requireLogin, async (req, res) => {
  if (req.user.role !== 'student') return res.send('Forbidden');
  const { testId } = req.params;

  // 🧩 Fix JOIN type to avoid hidden rows
  const test = await getAsync(
    'SELECT t.*, u.email AS teacher_email FROM tests t LEFT JOIN users u ON t.teacher_id = u.id WHERE t.id = ?',
    [testId]
  );

  if (!test) {
    console.log('DEBUG: Test not found for ID', testId);
    return res.status(404).send('Test not found');
  }

  const submission = await getAsync(
    'SELECT * FROM test_submissions WHERE test_id = ? AND student_id = ?',
    [testId, req.user.id]
  );

  res.render('student_submit_test', { 
    title: test.title,
    user: req.user,
    test,
    submission 
  });
});

app.post('/student/tests/:testId', requireLogin, subUpload.single('studentFile'), async (req, res) => {
  const { testId } = req.params;
  const filePath = req.file.filename;
  const existing = await getAsync('SELECT * FROM test_submissions WHERE test_id = ? AND student_id = ?', [testId, req.user.id]);
  if (existing) {
    await runAsync('UPDATE test_submissions SET file_path = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?', [filePath, existing.id]);
  } else {
    await runAsync('INSERT INTO test_submissions(test_id, student_id, file_path) VALUES(?,?,?)', [testId, req.user.id, filePath]);
  }
  res.redirect(`/student/tests/${testId}`);
});

// Start the server
app.listen(3000, () => console.log('Server running at http://localhost:3000'));
