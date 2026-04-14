// ========== SERVIDOR ESTÁTICO ==========
// Serve os arquivos do app para desenvolvimento local
// O banco de dados agora é o Supabase (não precisa mais de API local)

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos da raiz do projeto
app.use(express.static(path.join(__dirname, '..')));

// Fallback para SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Meu Rachão Pro rodando em http://localhost:${PORT}`);
  console.log('Banco de dados: Supabase (cloud)');
  console.log('Abra no navegador para usar o app.');
});
