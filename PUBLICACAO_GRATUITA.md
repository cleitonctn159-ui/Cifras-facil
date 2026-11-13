# Como Publicar o Cifra Fácil Gratuitamente (Sem Programar)

A pasta `pwa/` é um **site estático completo** — não precisa de servidor pago, não usa Google Play Console, não pede cartão de crédito e funciona **100% offline** depois do primeiro acesso.

Todos os caminhos do aplicativo são relativos (`./`), por isso ele funciona perfeitamente no **GitHub Pages** (mesmo em subpastas como `https://seunome.github.io/cifra-facil/`), além de Netlify Drop e Cloudflare Pages.

---

## Quais arquivos exatamente você deve publicar?

Envie **todos os arquivos de dentro da pasta `pwa/`**, mantendo as subpastas `assets/` e `icons/`:

- `.nojekyll` *(arquivo vazio que evita interferência do GitHub Pages)*
- `index.html` *(página principal do app)*
- `404.html` *(redirecionamento seguro para a página principal)*
- `styles.css` *(visual escuro e dourado)*
- `app.js` *(lógica, salvamento local e teleprompter)*
- `chord-engine.js` *(transposição e alinhamento de cifras)*
- `lyric-matcher.js` *(acompanhamento vocal em português)*
- `demo-songs.js` *(músicas de demonstração)*
- `manifest.json` *(configuração de instalação do PWA)*
- `sw.js` *(Service Worker para funcionar offline)*
- `assets/stage-hero.jpg` *(imagem do topo)*
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/icon-maskable-512.png`
- `icons/apple-touch-icon.png`

*(A subpasta `tests/` e este arquivo `PUBLICACAO_GRATUITA.md` são apenas de apoio; não atrapalham se forem enviados, mas não são necessários no site.)*

---

## Opção 1 (Recomendada): GitHub Pages — 100% Gratuito e Sem Cartão

Você pode fazer tudo pelo navegador, **sem digitar comandos**. Escolha o caminho mais fácil para você:

### Caminho A — Enviando só a pasta `pwa/` direto pelo site do GitHub (Mais simples)

1. **Baixe o projeto aqui do AI Studio:** clique no menu do projeto e escolha **Export / Download ZIP**. Depois, dê dois cliques no arquivo ZIP para abrir/extrair a pasta no seu computador e localize a pasta **`pwa`**.
2. **Crie sua conta gratuita no GitHub:** acesse **https://github.com** e clique em **Sign up** (não pede cartão de crédito).
3. **Crie um repositório novo:**
   - Clique no botão verde **New** (ou no sinal **+** no canto superior direito → **New repository**).
   - Em **Repository name**, escreva `cifra-facil`.
   - Deixe marcado **Public** (público é gratuito para GitHub Pages).
   - Clique em **Create repository**.
4. **Envie os arquivos da pasta `pwa`:**
   - Na tela que abrir, clique no link azul **uploading an existing file**.
   - Abra a pasta **`pwa`** no seu computador, selecione **tudo que está dentro dela** (`index.html`, `404.html`, `.nojekyll`, `manifest.json`, `sw.js`, `styles.css`, `app.js`, `chord-engine.js`, `lyric-matcher.js`, `demo-songs.js` e as pastas `icons` e `assets`) e arraste tudo para dentro da área pontilhada no site do GitHub.
   - Aguarde terminar de carregar os arquivos na lista abaixo.
   - Embaixo, clique no botão verde **Commit changes**.
5. **Ative o site no GitHub Pages:**
   - No topo do seu repositório, clique em **Settings** (engrenagem).
   - No menu esquerdo, clique em **Pages**.
   - Em **Build and deployment → Source**, deixe **Deploy from a branch**.
   - Em **Branch**, escolha **`main`** e ao lado deixe **`/ (root)`**, depois clique em **Save**.
6. **Pronto!** Aguarde cerca de 1 a 2 minutos e atualize a página **Settings → Pages**. Aparecerá no topo o endereço do seu app:
   `https://SEU-USUARIO.github.io/cifra-facil/`

### Caminho B — Se você exportou o projeto inteiro (Android + PWA) para o GitHub

O projeto já vem com a automação `.github/workflows/deploy-pwa-pages.yml` pronta:

1. No seu repositório do GitHub, abra **Settings → Pages**.
2. Em **Source**, selecione **GitHub Actions**.
3. Na aba **Actions** do repositório, clique em **Publicar Cifra Fácil PWA no GitHub Pages → Run workflow** (ou faça qualquer alteração na pasta `pwa/`).
4. O GitHub publicará **automaticamente somente a pasta `pwa/`** no seu link `https://SEU-USUARIO.github.io/NOME-DO-REPO/`, mantendo o projeto Android intacto no repositório.

---

## Opção 2: Netlify Drop (Arrastar e soltar)

1. Acesse **https://app.netlify.com/drop** e entre com uma conta gratuita (sem cartão).
2. Arraste a pasta **`pwa/`** inteira para a tela.
3. Em segundos você recebe um link `https://...netlify.app` pronto para instalar no celular e no computador.

---

## Opção 3: Cloudflare Pages (Site estático gratuito)

1. Crie uma conta gratuita em **https://dash.cloudflare.com** (não exige cartão para Pages).
2. Acesse **Workers & Pages → Create → Pages → Upload assets**.
3. Envie o conteúdo da pasta **`pwa/`** e clique em **Deploy**.

---

## Como instalar na tela inicial (Windows, Android e iPhone)

Depois de abrir o seu link `https://...` pela primeira vez (com internet para salvar os arquivos offline):

- **Windows (Google Chrome ou Microsoft Edge):**
  Clique no botão **Instalar** no topo do Cifra Fácil (ou no ícone de computador com seta na barra de endereços) e confirme **Instalar**.
- **Android (Google Chrome):**
  Toque no botão **Instalar** no topo do app, ou toque nos **3 pontinhos (⋮)** do Chrome → **Instalar aplicativo** / **Adicionar à tela inicial**.
- **iPhone e iPad (usar o navegador Safari):**
  Abra o link no **Safari**, toque no ícone **Compartilhar** (quadrado com seta para cima), role para baixo e toque em **Adicionar à Tela de Início** → **Adicionar**.

A partir daí, o **Cifra Fácil** abre em tela cheia como aplicativo, guarda suas músicas no próprio aparelho e funciona **mesmo sem internet**.
