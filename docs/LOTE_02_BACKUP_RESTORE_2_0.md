# LOTE 02 — Backup & Restore 2.0

Implementado sem alteração de layout.

## 2.1 Backup
- Backup novo usa payload versionado (`BACKUP_VERSION = 4`).
- Timestamp obrigatório (`exportedAt`).
- Arquivo exportado é JSON válido.
- Criptografia AES-256-GCM com PBKDF2-SHA-256 e 250.000 iterações.
- Integridade explícita por SHA-256 dentro do envelope criptografado.
- Backups criptografados anteriores (envelope v1) continuam aceitos.
- Limite de 5 MiB aplicado ao arquivo e ao payload.

## 2.2 Limite
O tamanho é verificado pelo `File.size` e novamente pelo número real de bytes UTF-8 antes de `JSON.parse()`.

Fluxo: `arquivo > 5 MiB → REJECT → JSON.parse() não executado`.

## 2.3 Validação rigorosa
- `tipo` inválido é rejeitado; não há fallback silencioso para `receita`.
- Campos desconhecidos no backup e nos lançamentos são rejeitados.
- Tipos dos campos estruturados são validados.
- IDs ausentes ou duplicados são rejeitados durante restore.
- Mapas com tipo/valores inválidos são rejeitados.
- Versão e schema incompatíveis são rejeitados.
- Timestamp de exportação é obrigatório e validado.

## 2.4–2.5 Restore atômico / rollback
O restore deixou de executar vários `sSet()` independentes. Agora todo o estado (`pj_tx2`, `pj_favs2`, `pj_pl`, `pj_plm`, `pj_ctb`, `pj_irrf`) é preparado e substituído por uma única operação `replaceState()`.

- Offline: o estado é preparado em fila + envelope local antes de alterar o estado em memória.
- Online: o estado é preparado localmente, enviado pela RPC transacional do Supabase e só então confirmado localmente.
- Falha/conflict: o estado anterior é restaurado localmente.
- Falha depois do commit remoto: é executada compensação remota para retornar ao estado anterior.
- O React só recebe o novo estado depois do commit completo.

## 2.6 Testes
Cobertura adicionada para:
- backup vazio;
- backup completo;
- backup grande;
- JSON/estrutura inválida;
- versão incompatível;
- campo ausente;
- campo desconhecido;
- tipo inválido;
- mapa com tipo inválido;
- falha durante restore;
- restore repetido/idempotente;
- preservação do estado anterior em falha remota.

Não foi criada migration Supabase: o banco já possui `save_app_state()` como operação única sobre a linha `app_state`, portanto o restore utiliza essa unidade transacional existente.
