# Correção — PDF Dados Mensais

- Corrigido o `StatTab` para receber explicitamente DAS, INSS, IRRF, Contabilidade e Pró-labore usados no relatório mensal.
- Corrigido o fluxo de abertura/compartilhamento do PDF para que falhas do `navigator.share` no iOS/Safari caiam automaticamente para abertura do Blob, em vez de exibir erro.
- Adicionada validação para impedir tentativa de abrir um PDF inválido/vazio.
- Nenhuma alteração de layout foi feita.
