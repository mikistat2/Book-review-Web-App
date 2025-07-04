import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import ejs from "ejs";

const app = express();
const port = process.env.PORT || 3000;

const db = new pg.Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Book-review',
  password: '147253@Mbt',
  port: 5432,
});

db.connect();

let books = [];
let cover_image = null;
let title = null;
let switcher = 0;

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


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


app.get("/", async(req, res)=>{
   await getBooks();
   const test = await getBookCoverByTitle("verity");
   console.log( "the api bookcover fot the current book " + test);

  res.render("index.ejs", {books});

 
});

app.get("/add", async (req, res) => {
  res.render("new.ejs", { books})

});

app.post("/add", (req, res) => {
  res.render("new.ejs", { books})
  
  });


app.post("/books/add", async (req, res) => {
  const { date_read, rating, recommendation, long_review, short_review } = req.body;
  title = req.body.title;
  cover_image = await getBookCoverByTitle(title);
  console.log("Book cover URL:", cover_image);
  console.log("Title:", title);
  
 try {
  const bookResult = await db.query(
    "INSERT INTO books (title, date_read, long_review, short_review, cover_image) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [title, date_read, long_review, short_review, cover_image]
  );
  const bookId = bookResult.rows[0].id;

  await db.query(
    "INSERT INTO details (rating, recomendation, book_id) VALUES ($1, $2, $3)",
    [rating, recommendation, bookId]
  );

  res.redirect("/");
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
    res.redirect("/");
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).send("Internal Server Error");
  }
})


app.get("/edit/:id", async (req, res) => {

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
    console.log(book.date_read)
    
    res.render("edit.ejs", { book, recomendation, });
  });

app.post("/edit", async (req, res)=>{
  
  const bookId = parseInt(req.body.editedBook);

  const { date_read, rating, recommendation, long_review, short_review,  } = req.body;
  title = req.body.title;
  const book_id = parseInt(req.body.editedBook);

    await db.query("UPDATE books SET title = $1, date_read = $2, long_review = $3, short_review = $4 WHERE id = $5",
    [title, date_read, long_review, short_review, book_id]);
    await db.query("UPDATE details SET rating = $1, recomendation = $2 WHERE book_id = $3",
    [rating, recommendation, book_id]);

     res.redirect("/");

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



app.listen(port, () => {
  console.log(`Server is running on port${port}`);
});
