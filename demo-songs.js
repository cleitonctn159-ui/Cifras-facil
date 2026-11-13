(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DEMO_SONGS = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createDemoSongs(baseTime = Date.now()) {
    return [
      {
        id: 'demo-luz-da-manha',
        title: 'Luz da Manhã',
        artist: 'Projeto Horizonte (Exemplo)',
        originalKey: 'G',
        transposeSteps: 0,
        isFavorite: true,
        createdAt: baseTime - 500000,
        updatedAt: baseTime - 500000,
        lastOpenedAt: baseTime - 120000,
        content: `[Intro]
G   D/F#   Em7   Cadd9

[Verso 1]
G                D/F#
Quando o vento sopra devagar
Em7                Cadd9
Traz a calma que o meu peito quis
G              D/F#
Cada acorde ajuda a lembrar
Em7       D         Cadd9
Que o caminho novo já se diz

[Pré-Refrão]
Am7          G/B
Mesmo na estrada mais longa
C9             Dsus4   D
O violão sustenta a canção

[Refrão]
G              D/F#
Brilha forte a luz da manhã
Em7              C9     C/G
Tudo recomeça em paz outra vez
Am7           G/B
Canto alto a minha esperança
C9      D       G
Em cada nota que Deus me fez

[Ponte]
Em7        B7
Nada pode apagar esse som
C9          Cm6
Que nasceu no meu coração
Am7        G/B        Dsus4  D
Sigo firme tocando no tom

[Final]
G   D/F#   Em7   Cmaj7   G`
      },
      {
        id: 'demo-estrada-de-ouro',
        title: 'Estrada de Ouro',
        artist: 'Banda Varanda (Exemplo)',
        originalKey: 'C',
        transposeSteps: 0,
        isFavorite: true,
        createdAt: baseTime - 400000,
        updatedAt: baseTime - 400000,
        lastOpenedAt: baseTime - 60000,
        content: `[Intro]
[C]  [G/B]  [Am7]  [Fmaj7]

[Verso 1]
[C]Acordei bem cedo com o [G/B]café na mesa
[Am7]Peguei minha viola e [Fmaj7]fui pro quintal
[C]Cada passo certo traz [G/B]mais clareza
[Dm7]Pra cantar a [G7sus4]vida sem [G7]ponto final

[Refrão]
[C]Segue pela estrada de [G/B]ouro e poeira
[Am7]Onde o pôr do sol pinta o [F]céu inteiro
[Dm7]Se a saudade bate na [C/E]hora primeira
[Fmaj7]Toco um [G7]acorde e [C]sorrio ligeiro

[Verso 2]
[C]Tem harmonia simples que [G/B]guarda segredo
[Am7]Um [G]baixo bonito des[Fmaj7]cendo no tom
[Dm7]Quem toca com alma não [C/E]canta com medo
[F]Faz da [G7]madrugada um [C]abraço bom

[Ponte]
[E7]E se o tempo muda, eu [Am7]mudo a afinação
[F]Com [Fm6]calma e ternura na [C]palma da mão
[Dm7]Um [G7]solo suave [C]faz a direção

[Final]
[C]  [G/B]  [Am7]  [Fmaj7]  [C]`
      },
      {
        id: 'demo-mar-sereno',
        title: 'Mar Sereno',
        artist: 'Clara & Trio (Exemplo)',
        originalKey: 'Eb',
        transposeSteps: 0,
        isFavorite: false,
        createdAt: baseTime - 300000,
        updatedAt: baseTime - 300000,
        lastOpenedAt: 0,
        content: `[Intro]
Ebmaj7   Cm7   Fm7   Bb7sus4   Bb7

[Verso 1]
Ebmaj7              Bb/D
Olho as ondas calmas do lugar
Cm7                Abmaj7
Sinto a brisa leve no meu rosto
Fm7               Bb7
Deixo o pensamento navegar
Gm7      C7        Fm7    Bb7
Sem pressa de chegar antes do agosto

[Refrão]
Ebmaj7     G7/B     Cm7
Mar sereno guarda o meu cantar
Abmaj7    Bb7      Ebmaj7  Bb/D
Leva a melodia pra além do cais
Cm7       F7       Fm7     Bb7
Toda nota solta aprende a voar
Abmaj7    Bb7      Ebmaj7
Onde o silêncio traz ainda mais paz

[Ponte]
Edim             Fm7
Quando a noite acende o farol
Bb7sus4   Bb7      Ebmaj7
Fica fácil esperar pelo sol

[Final]
Ebmaj7   Abmaj7   Eb6`
      },
      {
        id: 'demo-noite-acustica',
        title: 'Noite Acústica',
        artist: 'Duo Madeira (Exemplo)',
        originalKey: 'Am',
        transposeSteps: 0,
        isFavorite: false,
        createdAt: baseTime - 200000,
        updatedAt: baseTime - 200000,
        lastOpenedAt: 0,
        content: `[Intro]
Am7   Dm7   G7   Cmaj7   Fmaj7   Bdim   E7

[Verso 1]
Am7                 Dm7
Palco iluminado em tom dourado
G7                  Cmaj7
Cordas novas prontas pra soar
Fmaj7               Bm7(b5)
Todo o repertório organizado
E7                  Am7   E7(#9)
Pra essa plateia se emocionar

[Refrão]
Am7           Dm7
Sobe o som da noite acústica
G7            Cmaj7
Cada verso encontra o seu lugar
Fmaj7         Dm7
Pulsa forte a nossa música
E7sus4   E7   Am7
Até a última luz se apagar

[Solo]
Am7  Dm7  G7  Cmaj7  Fmaj7  E7  Am7`
      },
      {
        id: 'demo-verso-simples',
        title: 'Verso Simples',
        artist: 'João da Serra (Exemplo)',
        originalKey: 'D',
        transposeSteps: 0,
        isFavorite: true,
        createdAt: baseTime - 100000,
        updatedAt: baseTime - 100000,
        lastOpenedAt: baseTime - 240000,
        content: `[Intro]
D   A/C#   Bm7   G   A4   A

[Verso 1]
D                  A/C#
Não precisa muito pra dizer
Bm7                  G
Basta um violão e um bom lugar
D/F#                 G
Quando a gente canta pra valer
Em7         A4   A   D
Fica mais bonito de escutar

[Refrão]
G              A/G
Canta comigo esse verso simples
F#m7           Bm7
Deixa a alegria tomar o salão
Em7            A7
Onde houver música e amizade
D      A/C#    Bm7   A
Sempre haverá canção
Em7      A7    D
Sempre haverá canção

[Final]
D   G/D   Daug   D`
      }
    ];
  }

  return createDemoSongs;
});
