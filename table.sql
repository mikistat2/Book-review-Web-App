-- 1. Create the sequence for the users table
CREATE SEQUENCE IF NOT EXISTS public.users_id_seq
    INCREMENT 1 START 1;

-- 2. Create the users table
CREATE TABLE IF NOT EXISTS public.users
(
    id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    username character varying(50) NOT NULL,
    email character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    google_id character varying(255),
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_username_key UNIQUE (username)
);

-- 3. Create the sequence for the books table
CREATE SEQUENCE IF NOT EXISTS public.bookes_id_seq
    INCREMENT 1 START 1;

-- 4. Create the books table
CREATE TABLE IF NOT EXISTS public.books
(
    id integer NOT NULL DEFAULT nextval('bookes_id_seq'::regclass),
    title character varying(45),
    date_read date,
    long_review text,
    short_review text,
    cover_image character varying(2083),
    user_id integer,
    CONSTRAINT bookes_pkey PRIMARY KEY (id),
    CONSTRAINT fk_user
        FOREIGN KEY(user_id) 
        REFERENCES public.users(id)
        ON DELETE CASCADE
);

-- 5. Create the sequence for the details table
CREATE SEQUENCE IF NOT EXISTS public.details_id_seq
    INCREMENT 1 START 1;

-- 6. Create the details table
CREATE TABLE IF NOT EXISTS public.details
(
    id integer NOT NULL DEFAULT nextval('details_id_seq'::regclass),
    rating double precision,
    recomendation integer,
    book_id integer,
    CONSTRAINT details_pkey PRIMARY KEY (id),
    CONSTRAINT fk_book
        FOREIGN KEY(book_id) 
        REFERENCES public.books(id)
        ON DELETE CASCADE
);