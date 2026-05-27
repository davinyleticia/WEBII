require('dotenv').config();

const express = require('express');
const exphbs = require('express-handlebars');
const session = require('express-session');
const db = require('./db');

const app = express();

app.engine('handlebars', exphbs.engine());
app.set('view engine', 'handlebars');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const dirPdfs = './public/uploads/pdfs';
const dirImagens = './public/uploads/imagens';

if (!fs.existsSync(dirPdfs)) fs.mkdirSync(dirPdfs, { recursive: true });
if (!fs.existsSync(dirImagens)) fs.mkdirSync(dirImagens, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'slide_pdf') {
            cb(null, 'public/uploads/pdfs/');
        } else if (file.fieldname === 'imagem_capa') {
            cb(null, 'public/uploads/imagens/');
        }
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '_' + path.basename(file.originalname)); 
    }
});

const upload = multer({ storage: storage });

function checarAutenticacao(req, res, next) {
    if (req.session.logado) {
        next();
    } else {
        res.redirect('/login');
    }
}


// aqui fica as rotas

app.get('/', (req, res) => {
    const sqlSobre = "SELECT * FROM sobre ORDER BY id DESC LIMIT 1";
    const sqlEscolas = "SELECT * FROM escolas";
    const sqlBlog = "SELECT * FROM blog_posts ORDER BY data_publicacao DESC LIMIT 6"; // Mostra os 6 materiais mais recentes
    
    db.query(sqlSobre, (err, resultSobre) => {
        if (err) {
            console.error("Erro ao carregar o Sobre:", err);
            return res.send("Erro interno do servidor.");
        }

        db.query(sqlEscolas, (err, resultEscolas) => {
            if (err) {
                console.error("Erro ao carregar as Escolas:", err);
                return res.send("Erro interno do servidor.");
            }

            db.query(sqlBlog, (err, resultBlog) => {
                if (err) {
                    console.error("Erro ao carregar o Blog:", err);
                    return res.send("Erro interno do servidor.");
                }

                res.render('index', { 
                    sobre: resultSobre.length > 0 ? resultSobre[0] : null, 
                    escolas: resultEscolas,
                    posts: resultBlog
                });
            });
        });
    });
});

app.get('/admin/sobre', checarAutenticacao, (req, res) => {
    const sql = "SELECT * FROM sobre ORDER BY id DESC LIMIT 1";
    db.query(sql, (err, results) => {
        if (err) throw err;
        // Se já existir uma biografia, passa para a view. Se não, passa vazio.
        const dadosSobre = results.length > 0 ? results[0] : null;
        res.render('admin/sobre', { sobre: dadosSobre });
    });
});

app.post('/admin/sobre/salvar', checarAutenticacao, (req, res) => {
    const { biografia } = req.body;
    
    db.query("SELECT id FROM sobre LIMIT 1", (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            const id = results[0].id;
            const sqlUpdate = "UPDATE sobre SET biografia = ? WHERE id = ?";
            db.query(sqlUpdate, [biografia, id], (err, result) => {
                if (err) throw err;
                res.redirect('/admin/sobre');
            });
        } else {
            const sqlInsert = "INSERT INTO sobre (biografia) VALUES (?)";
            db.query(sqlInsert, [biografia], (err, result) => {
                if (err) throw err;
                res.redirect('/admin/sobre');
            });
        }
    });
});

app.get('/login', (req, res) => {
    res.render('login', { layout: false }); 
});


const bcrypt = require('bcrypt');

app.post('/autenticar', (req, res) => {
    const { login, senha } = req.body;
    const sql = "SELECT * FROM usuarios WHERE login = ?";
    
    db.query(sql, [login], async (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            const usuarioEncontrado = results[0];
            
            const senhaValida = await bcrypt.compare(senha, usuarioEncontrado.senha);
            
            if (senhaValida) {
                req.session.logado = true;
                req.session.usuario = login;
                res.redirect('/admin');
            } else {
                res.send('Credenciais inválidas! <a href="/login">Tentar novamente</a>');
            }
        } else {
            res.send('Utilizador não encontrado! <a href="/login">Tentar novamente</a>');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/admin', checarAutenticacao, (req, res) => {
    res.render('admin/dashboard');
});

app.get('/admin/escolas', checarAutenticacao, (req, res) => {
    const sql = "SELECT * FROM escolas";
    db.query(sql, (err, escolas) => {
        res.render('admin/escolas', { escolas });
    });
});

app.post('/admin/escolas/nova', checarAutenticacao, (req, res) => {
    const { nome, localizacao } = req.body;
    const sql = "INSERT INTO escolas (nome, localizacao) VALUES (?, ?)";
    db.query(sql, [nome, localizacao], (err, result) => {
        res.redirect('/admin/escolas');
    });
});

app.get('/admin/escolas/deletar/:id', checarAutenticacao, (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM escolas WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        res.redirect('/admin/escolas');
    });
});

app.get('/admin/disciplinas', checarAutenticacao, (req, res) => {
    const sqlDisciplinas = `
        SELECT d.id, d.nome, d.descricao, e.nome AS escola_nome 
        FROM disciplinas d
        LEFT JOIN escolas e ON d.escola_id = e.id
    `;
    const sqlEscolas = "SELECT id, nome FROM escolas";

    db.query(sqlDisciplinas, (err, disciplinas) => {
        if (err) throw err;
        db.query(sqlEscolas, (err, escolas) => {
            if (err) throw err;
            res.render('admin/disciplinas', { disciplinas, escolas });
        });
    });
});

app.post('/admin/disciplinas/nova', checarAutenticacao, (req, res) => {
    const { nome, descricao, escola_id } = req.body;
    const sql = "INSERT INTO disciplinas (nome, descricao, escola_id) VALUES (?, ?, ?)";
    db.query(sql, [nome, descricao, escola_id], (err, result) => {
        if (err) throw err;
        res.redirect('/admin/disciplinas');
    });
});

app.get('/admin/disciplinas/deletar/:id', checarAutenticacao, (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM disciplinas WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) throw err;
        res.redirect('/admin/disciplinas');
    });
});

app.get('/', (req, res) => {
    const sqlSobre = "SELECT * FROM sobre ORDER BY id DESC LIMIT 1";
    const sqlEscolas = "SELECT * FROM escolas";
    const sqlBlog = "SELECT * FROM blog_posts ORDER BY data_publicacao DESC LIMIT 4"; // Pega os 4 últimos posts/materiais
    
    db.query(sqlSobre, (err, resultSobre) => {
        db.query(sqlEscolas, (err, resultEscolas) => {
            db.query(sqlBlog, (err, resultBlog) => {
                res.render('index', { 
                    sobre: resultSobre[0], 
                    escolas: resultEscolas,
                    posts: resultBlog
                });
            });
        });
    });
});

app.get('/admin/blog', checarAutenticacao, (req, res) => {
    const sql = "SELECT * FROM blog_posts ORDER BY data_publicacao DESC";
    db.query(sql, (err, posts) => {
        if (err) throw err;
        res.render('admin/blog', { posts });
    });
});

app.post('/admin/blog/novo', checarAutenticacao, upload.fields([
    { name: 'slide_pdf', maxCount: 1 },
    { name: 'imagem_capa', maxCount: 1 }
]), (req, res) => {
    const { titulo, conteudo } = req.body;
    
    const pdf_url = req.files && req.files['slide_pdf'] 
        ? '/uploads/pdfs/' + req.files['slide_pdf'][0].filename 
        : null;
        
    const imagem_url = req.files && req.files['imagem_capa'] 
        ? '/uploads/imagens/' + req.files['imagem_capa'][0].filename 
        : null;
    
    const sql = "INSERT INTO blog_posts (titulo, conteudo, pdf_url, imagem_url) VALUES (?, ?, ?, ?)";
    
    db.query(sql, [titulo, conteudo, pdf_url, imagem_url], (err, result) => {
        if (err) {
            console.error("Erro ao salvar post:", err);
            return res.status(500).send("Erro ao salvar no banco de dados.");
        }
        res.redirect('/admin/blog');
    });
});

app.get('/admin/blog/deletar/:id', checarAutenticacao, (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM blog_posts WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) throw err;
        res.redirect('/admin/blog');
    });
});

app.listen(8081, () => {
    console.log("Servidor rodando em http://localhost:8081");
});