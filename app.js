import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import ejs from "ejs";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Book-review',
  password: '147253@Mbt',
  port: 5432,
});

db.connect();

let books = [];

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

async function getBooks() {
   try{
    const result = await db.query("SELECT * FROM books AS b JOIN details d ON b.id = d.book_id ");
    books = result.rows;
    
  }
  catch (error) {
    console.error("Error fetching books:", error);
    
  }

}

app.get("/", async(req, res)=>{
   await getBooks();
  res.render("index.ejs", {books});
 
});


app.post("/add", (req, res) => {
  res.render("new.ejs", { books})
  
  });

app.post("/books/add", async (req, res) => {
  const { title, cover_image, date_read, rating, recommendation, long_review, short_review } = req.body;

  
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












app.listen(port, () => {
  console.log(`Server is running on port${port}`);
});


