#!/usr/bin/env node
// Gera os três segredos da seção 3.1 do SDD a partir de uma senha.
//
// Uso:
//   node scripts/gerar-segredos.mjs "sua-senha-aqui"
//
// Rode isso no SEU terminal, com a senha real. Nunca cole a senha numa
// conversa com IA nem grave este comando no histórico de um script versionado.
import crypto from 'crypto';

const senha = process.argv[2];
if (!senha) {
  console.error('Uso: node scripts/gerar-segredos.mjs "sua-senha"');
  process.exit(1);
}

// 100000 é o teto do PBKDF2 no runtime real do Cloudflare Workers (o
// Web Crypto do V8 rejeita qualquer valor acima disso — wrangler dev local
// não impõe esse limite, por isso o problema só aparece em produção).
const ITERACOES = 100000;
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(senha, salt, ITERACOES, 32, 'sha256');
const sessionSecret = crypto.randomBytes(32);

console.log('SENHA_HASH=' + hash.toString('hex'));
console.log('SENHA_SALT=' + salt.toString('hex'));
console.log('SESSION_SECRET=' + sessionSecret.toString('hex'));
console.log('');
console.log('Para produção, rode um de cada vez (vai pedir o valor por stdin):');
console.log('  wrangler secret put SENHA_HASH');
console.log('  wrangler secret put SENHA_SALT');
console.log('  wrangler secret put SESSION_SECRET');
console.log('');
console.log('Para testar local com "wrangler dev", cole as 3 linhas de cima');
console.log('num arquivo .dev.vars na raiz do projeto. NUNCA commitar esse arquivo.');
