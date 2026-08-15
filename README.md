# Marcus Vinícius Porto Souza LTDA — Gestão Financeira PJ

App de gestão financeira para dentista PJ (Simples Nacional).

## Tecnologias
- Next.js 14
- React 18
- Recharts
- localStorage (dados salvos no dispositivo)

## Como fazer o deploy

### 1. GitHub
1. Crie um repositório no [github.com](https://github.com)
2. Suba todos esses arquivos para o repositório

### 2. Vercel
1. Acesse [vercel.com](https://vercel.com) e faça login com o GitHub
2. Clique em **Add New Project** → selecione o repositório
3. Clique em **Deploy** (Vercel detecta Next.js automaticamente)
4. Em 2 minutos o app estará em: `https://seu-projeto.vercel.app`

### 3. Instalar no iPhone (PWA)
1. Abra o link do Vercel no **Safari**
2. Toque em **Compartilhar** (ícone de caixa com seta)
3. **Adicionar à Tela de Início**
4. O app abre em tela cheia como um app nativo

## Desenvolvimento local
```bash
npm install
npm run dev
```
Acesse: http://localhost:3000

## Ícones
Adicione os arquivos `icon-192.png` e `icon-512.png` na pasta `/public`
para que o app tenha ícone personalizado na tela inicial do iPhone.
Use a logo da clínica redimensionada para 192×192 e 512×512 pixels.

## Dados
Os dados ficam salvos no **localStorage** do navegador/dispositivo.
Use a função de **Backup** (⚙️) para exportar e não perder os dados.
