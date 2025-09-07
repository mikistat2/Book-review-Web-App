import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import ejs from "ejs";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth2";
import flash from "connect-flash";

dotenv.config();

const app = express();

const port = process.env.PORT || 3000;

const db = new pg.Client(
  process.env.DATABASE_URL // Checks if this exists
    ? {
        // If YES, use the cloud database URL
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        // If NO, use your local database settings
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      }
);

db.connect();

let books = [];

// Helper: get books for a specific user
async function getBooksForUser(userId) {
  try {
    const result = await db.query(`
      SELECT 
        b.id AS book_id, 
        b.title, 
        b.date_read, 
        b.cover_image, 
        b.short_review, 
        b.long_review,
        d.rating, 
        d.recomendation
      FROM books AS b
      JOIN details d ON b.id = d.book_id
      WHERE b.user_id = $1
    `, [userId]);
    return result.rows;
  } catch (error) {
    console.error("Error fetching books for user:", error);
    return [];
  }
}
let cover_image = null;
let title = null;
let switcher = 0;
const saltRounds = 10;

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Trust the first proxy
app.set('trust proxy', 1);

app.use(flash());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    sameSite: 'lax',
  },
}));


app.use(passport.initialize());
app.use(passport.session());


// Authentication middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}


// for getting the book data base


async function getBooks() {
   try{
    const result = await db.query(`
  SELECT 
    b.id AS book_id, 
    b.title, 
    b.date_read, 
    b.cover_image, 
    b.short_review, 
    b.long_review,
    d.rating, 
    d.recomendation
  FROM books AS b
  JOIN details d ON b.id = d.book_id
`);
books = result.rows;


  }
  catch (error) {
    console.error("Error fetching books:", error);
  }
}

// fot the book cover by title using api and axios

async function getBookCoverByTitle(title) {
  if (!title) return null;

  try {
    const res = await axios.get(`https://openlibrary.org/search.json?title=${encodeURIComponent(title.trim())}`);
    const docs = res.data.docs;

    if (!docs || docs.length === 0) {
      console.warn("No docs found for title:", title);
      return null;
    }

    for (const doc of docs) {
      if (doc.cover_edition_key) {
        
        return `https://covers.openlibrary.org/b/OLID/${doc.cover_edition_key}-L.jpg`;
      } else if (doc.edition_key && doc.edition_key.length > 0) {
       
        return `https://covers.openlibrary.org/b/OLID/${doc.edition_key[0]}-L.jpg`;
      }
    }
    return null;

  } catch (error) {
    console.error("Error fetching cover:", error.message);
    return null;
  }
}

// Logout route
app.get("/logout", (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect("/");
  });
});

// Logout confirmation page
app.get("/logout-page", (req, res) => {
  res.render("logout.ejs");
});

// Root route - renders your existing landing page
app.get("/", (req, res) => {
  res.render("landing.ejs");
});

// Login page
app.get("/login", (req, res) => {
  res.render("login.ejs", { message: req.flash("error") });
});

// Signup page
app.get("/signup", (req, res) => {
  res.render("signup.ejs", { usernameError: undefined, emailError: undefined, passwordError: undefined });
});

// Book index moved to /books
// Protect /books route
app.get("/books", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id; // <-- Use Passport's user object
  const books = await getBooksForUser(userId);
  res.render("index.ejs", { books, user: req.user });
});
// ...existing code...

// Protect /add route
app.get("/add", ensureAuthenticated, async (req, res) => {
  res.render("new.ejs", { books });
});

// DELETED DUPLICATE /signup and /login GET routes that were here

// User registration (signup)
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  let usernameError, emailError, passwordError;
  try {
    // Check for duplicate username
    const usernameCheck = await db.query('SELECT username FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      usernameError = "Username is taken";
    }
    // Check for duplicate email
    const emailCheck = await db.query('SELECT email FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      emailError = "Email already exists";
    }
    // Password validation (example: min 6 chars)
    if (!password || password.length < 6) {
      passwordError = "Password must be at least 6 characters";
    }
    if (usernameError || emailError || passwordError) {
      return res.render("signup.ejs", { usernameError, emailError, passwordError });
    }
    const hash = await bcrypt.hash(password, saltRounds);
    const userResult = await db.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hash]
    );
    req.login(userResult.rows[0], (err) => {
      if (err) { return next(err); }
      return res.redirect("/books");
    });
  } catch (error) {
    // Handle unique constraint errors from the database
    if (error.code === '23505') {
      if (error.detail && error.detail.includes('username')) {
        usernameError = "Username is taken";
      }
      if (error.detail && error.detail.includes('email')) {
        emailError = "Email already exists";
      }
      return res.render("signup.ejs", { usernameError, emailError, passwordError });
    }
    console.log(error.message);
    res.status(500).send("An error occurred during registration.");
  }
});


// User login
app.post("/login", passport.authenticate("local", {
  successRedirect: "/books",
  failureRedirect: "/login",
  failureFlash: true
}));

// Protect /add POST
app.post("/add", ensureAuthenticated, (req, res) => {
  res.render("new.ejs", { books });
});


app.post("/books/add", ensureAuthenticated, async (req, res) => {
  const { date_read, rating, recommendation, long_review, short_review } = req.body;
  const title = req.body.title;
  const cover_image = await getBookCoverByTitle(title);
  const userId = req.user.id;
  try {
    // Insert book with user_id
    const bookResult = await db.query(
      "INSERT INTO books (title, date_read, long_review, short_review, cover_image, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [title, date_read, long_review, short_review, cover_image, userId]
    );
    const bookId = bookResult.rows[0].id;
    await db.query(
      "INSERT INTO details (rating, recomendation, book_id) VALUES ($1, $2, $3)",
      [rating, recommendation, bookId]
    );
    res.redirect("/books");
  } catch (error) {
    console.error("Error adding book:", error);
    res.status(500).send("Internal Server Error");
  }
});



app.post ("/delete", async (req, res)=>{
  const bookId = parseInt(req.body.deletedBook);
  console.log("Deleting book with ID:" + bookId);

  try {
    await db.query("DELETE FROM details WHERE book_id = $1", [bookId]);
    await db.query("DELETE FROM books WHERE id = $1", [bookId]);
    res.redirect("/books");
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).send("Internal Server Error");
  }
})


// Protect /edit/:id route
app.get("/edit/:id", ensureAuthenticated, async (req, res) => {
  const bookId = parseInt(req.params.id);
  const result = await db.query(`
    SELECT 
      b.id AS book_id, 
      b.title, 
      b.date_read, 
      b.cover_image, 
      b.short_review, 
      b.long_review,
      d.rating, 
      d.recomendation
    FROM books AS b
    JOIN details d ON b.id = d.book_id
    WHERE b.id = $1`, [bookId]);
  const book = result.rows[0];
  const recomendation = book.recomendation;
  book.date_read = new Date(book.date_read).toISOString().split('T')[0];
  res.render("edit.ejs", { book, recomendation });
});

app.post("/edit", ensureAuthenticated, async (req, res) => {
  const bookId = parseInt(req.body.editedBook);
  let { date_read, rating, recommendation, long_review, short_review, title } = req.body;
  const book_id = bookId;

  // Validate and sanitize fields
  if (!title || !date_read || !rating || !recommendation || !long_review || !short_review) {
    return res.status(400).send("All fields are required.");
  }

  // Ensure recommendation and rating are integers
  const fixedRecommendation = parseInt(recommendation, 10);
  const fixedRating = parseInt(rating, 10);
  if (isNaN(fixedRecommendation) || isNaN(fixedRating)) {
    return res.status(400).send("Rating and recommendation must be numbers.");
  }

  // Ensure date is in YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_read)) {
    return res.status(400).send("Date must be in YYYY-MM-DD format.");
  }

  try {
    // Fetch new cover image if title is changed
    const cover_image = await getBookCoverByTitle(title);
    await db.query(
      "UPDATE books SET title = $1, date_read = $2, long_review = $3, short_review = $4, cover_image = $5 WHERE id = $6",
      [title, date_read, long_review, short_review, cover_image, book_id]
    );
    await db.query(
      "UPDATE details SET rating = $1, recomendation = $2 WHERE book_id = $3",
      [fixedRating, fixedRecommendation, book_id]
    );
    res.redirect("/books");
  } catch (err) {
    console.error("Error updating book:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/book/:id", async (req, res) => {
  const bookId = req.params.id;
  const result = await db.query(`
    SELECT 
      b.id AS book_id, 
      b.title, 
      b.date_read, 
      b.cover_image, 
      b.short_review, 
      b.long_review,
      d.rating, 
      d.recomendation
    FROM books AS b
    JOIN details d ON b.id = d.book_id
    WHERE b.id = $1`, [bookId]);


    res.render("more.ejs", { book: result.rows[0], cover_image, title });
});

app.get("/about", (req, res)=>{
  res.render("about.ejs")
})

// for the local authentication 

passport.use(new Strategy(
  { usernameField: 'login', passwordField: 'password' },
  async (login, password, done) => {
    try {
      // Check if login is email or username
      const isEmail = /.+@.+\..+/.test(login);
      const userResult = isEmail
        ? await db.query('SELECT * FROM users WHERE email = $1', [login])
        : await db.query('SELECT * FROM users WHERE username = $1', [login]);
      if (userResult.rows.length === 0) {
        return done(null, false, { message: "User does not exist. Please register." });
      }
      const user = userResult.rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return done(null, false, { message: "Incorrect password. Please try again." });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// for the google auth 

app.get ("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"],
})
);

app.get("/auth/google/callback",
  passport.authenticate("google", {
    successRedirect: "/books",
    failureRedirect: "/login",
  })
);



passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.WEBSITE_URL}/auth/google/callback`,
  userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
}, async (accessToken, refreshToken, profile, cb) => {
  console.log("Google profile:", profile);
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [profile.email]);
    if (result.rows.length === 0) {
    const username = profile.displayName || profile.email;
const newUser = await db.query(
  "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *",
  [username, profile.email, "google"]
);
      cb(null, newUser.rows[0]);
    } else {
      cb(null, result.rows[0]);
    }
  } catch (err) {
    cb(err);
  }
}));

passport.serializeUser((user, cb) => {
  cb(null, user.id);
});

passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      cb(null, user);
    } else {
      cb(null, false); // No user found
    }
  } catch (err) {
    cb(err);
  }
});



app.listen(port || 3000, () => {
  console.log(`Server is running on port ${port}`);
});

