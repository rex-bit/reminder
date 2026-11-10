-- Default daily template (the class's own layout). Only the standing text is stored; subjects, homework and the
-- piket roster change every day, so they start empty. Skipped if a template with this name already exists.
INSERT INTO reminder_templates (name, description, content)
SELECT 'Reminder harian kelas', 'Format reminder harian: SERAGAM, MAPEL, TUGAS, PIKET, CATATAN',
  jsonb_build_object(
    'uniform', E'*cowok*: baju batik sekolah, celana biru dan memakai tali pinggang\n*cewek* : kerudung putih, baju batik sekolah, rok biru dan memakai tali pinggang',
    'subjects', '[]'::jsonb,
    'homework', '[]'::jsonb,
    'piket', '[]'::jsonb,
    'notes', E'• jangan lupa melaksanakan piket sebelum kalian pulang ke rumah masing-masing.\n• jangan lupa ngerjain tugas yang diberikan guru yaa, nanti kalian bisa dimarahin.',
    'announcements', ''
  )
WHERE NOT EXISTS (SELECT 1 FROM reminder_templates WHERE lower(name) = 'reminder harian kelas' AND deleted_at IS NULL);
