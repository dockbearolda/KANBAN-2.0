'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Liste canonique des étapes du pipeline (slug), dans l'ordre exact.
const STAGES = [
  { slug: 'demande', label: 'Commande' },
  { slug: 'devis_en_cours', label: 'Devis en cours' },
  { slug: 'devis_accepte', label: 'Devis accepté' },
  { slug: 'prod_dtf', label: 'Production DTF' },
  { slug: 'prod_pressage', label: 'Production Pressage' },
  { slug: 'prod_trotec', label: 'Production Trotec' },
  { slug: 'prod_roland_uv', label: 'Production Roland UV' },
  { slug: 'prod_sous_traitance', label: 'Production Sous-traitance' },
  { slug: 'prod_autre', label: 'Production Autre' },
  { slug: 'facturation', label: 'Facturation' },
  { slug: 'archive', label: 'Archivé' },
  { slug: 'maquette_fiverr', label: 'Commande Maquette Fiverr' },
  { slug: 'toptex', label: 'Toptex' },
];

const STAGE_SLUGS = STAGES.map((s) => s.slug);

const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

// Choix du backend :
//  - DATABASE_URL défini → vrai PostgreSQL (Railway / prod / local avec Postgres).
//  - DATABASE_URL absent → base en mémoire (pg-mem), pour tester en local sans
//    rien installer. Données NON persistantes (réinitialisées à chaque démarrage).
let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // SSL requis côté Railway en production.
    ssl: isProd ? { rejectUnauthorized: false } : false,
  });
} else {
  // Fallback local zéro-config.
  const { newDb } = require('pg-mem');
  const mem = newDb();
  mem.registerExtension('pgcrypto', () => {});
  let seq = 0;
  const hex = (n) => n.toString(16).padStart(12, '0');
  mem.public.registerFunction({
    name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => '00000000-0000-4000-8000-' + hex(++seq),
  });
  const MemPg = mem.adapters.createPg();
  pool = new MemPg.Pool();
  console.log('ℹ  Mode local : base en mémoire (pg-mem). Données non persistantes.');
}

// Migration automatique au démarrage : crée le schéma + seed si vide.
async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  // Seed : si la table est vide, on insère quelques demandes d'exemple
  // réparties sur plusieurs étapes pour démontrer le pipeline.
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM requests');
  if (rows[0].n === 0) {
    await seed();
  }
}

async function seed() {
  const today = new Date();
  const inDays = (d) => {
    const x = new Date(today);
    x.setDate(x.getDate() + d);
    return x.toISOString().slice(0, 10);
  };

  const samples = [
    {
      stage: 'demande', priority: 3, client_type: 'pro', billing_company: 'Brasserie du Coin',
      contact_referent: 'Julie M.', quantity: 50, product: 'T-shirts DTF logo',
      project_value: 850, description: 'Tee-shirts événement bière artisanale',
      deadline: inDays(3), status: 'À traiter', position: 1000,
    },
    {
      stage: 'demande', priority: 1, client_type: 'perso', billing_company: 'Particulier',
      contact_referent: 'Léa', quantity: 2, product: 'Mug photo',
      project_value: 30, description: 'Cadeau anniversaire', deadline: inDays(12),
      status: 'En attente client', position: 2000,
    },
    {
      stage: 'devis_en_cours', priority: 2, client_type: 'pro', billing_company: 'Club Sportif Aurillac',
      contact_referent: 'Coach Bernard', quantity: 30, product: 'Maillots floqués',
      project_value: 1450, description: 'Maillots saison 2026', deadline: inDays(8),
      status: 'En attente client', position: 1000,
    },
    {
      stage: 'devis_accepte', priority: 3, client_type: 'pro', billing_company: 'Mairie de Vic',
      contact_referent: 'Service Com', quantity: 120, product: 'Tote bags sérigraphie',
      project_value: 3200, description: 'Sacs marché de Noël', deadline: inDays(1),
      status: 'Validé', position: 1000,
    },
    {
      stage: 'prod_dtf', priority: 2, client_type: 'pro', billing_company: 'Auto-école Rapid',
      contact_referent: 'M. Faure', quantity: 15, product: 'Polos brodés DTF',
      project_value: 540, description: 'Polos moniteurs', deadline: inDays(-1),
      status: 'Bloqué', position: 1000,
    },
    {
      stage: 'facturation', priority: 1, client_type: 'pro', billing_company: 'Pizzeria Bella',
      contact_referent: 'Marco', quantity: 8, product: 'Tabliers personnalisés',
      project_value: 240, description: 'Tabliers cuisine', deadline: inDays(-5),
      status: 'Terminé', position: 1000,
    },
  ];

  for (const s of samples) {
    await pool.query(
      `INSERT INTO requests
        (stage, priority, client_type, billing_company, contact_referent, quantity,
         product, project_value, description, deadline, status, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [s.stage, s.priority, s.client_type, s.billing_company, s.contact_referent,
       s.quantity, s.product, s.project_value, s.description, s.deadline, s.status, s.position],
    );
  }
}

module.exports = { pool, init, STAGES, STAGE_SLUGS };
