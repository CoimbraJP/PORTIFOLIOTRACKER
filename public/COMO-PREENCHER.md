# Como preencher a planilha de importação

Abra o `modelo-importacao.csv` no Excel, no LibreOffice ou no Google Planilhas.
Ele já vem com linhas de exemplo cobrindo todos os casos — **apague-as** e
coloque as suas.

## As colunas

| Coluna | Obrigatória | O que colocar |
|---|---|---|
| **Data** | sim | `dd/mm/aaaa`. A data do negócio, não a da liquidação. |
| **Classe** | sim | Uma das 12 classes do sistema. Aceita o nome (`Ações Brasil`) ou o código (`acoes-br`). |
| **Carteira** | sim | Onde o ativo fica guardado: `XP`, `Binance`, `Ledger`. Se não existir, é criada. |
| **Codigo** | sim | O ticker: `PETR4`, `HGLG11`, `AAPL`, `BTC`. |
| **Nome** | não | Só para leitura. Se ficar vazio, o catálogo preenche. |
| **Operacao** | sim | `Compra` ou `Venda`. Também aceita `C`/`V`. |
| **Quantidade** | sim | Aceita fração: `0,15` de bitcoin. |
| **Preco Unitario** | sim | Preço de **uma** unidade, não o total. |
| **Moeda** | não | `BRL` (padrão) ou `USD`. |
| **Dolar na Data** | só em USD | Quanto valia o dólar naquele dia: `5,42`. |
| **Taxas** | não | Corretagem e emolumentos. |
| **Observacao** | não | Anotação livre. |

## Regras que evitam retrabalho

**Preço unitário, nunca o total.** Comprou 900 PETR4 por R$ 30.150? O preço é
`33,50`. É o erro mais comum e o mais caro: multiplica o custo pela quantidade
duas vezes.

**Uma linha por negócio, não por posição.** Se você comprou PETR4 três vezes,
são três linhas. O sistema calcula o preço médio sozinho — é justamente o que
ele faz de melhor, e digitar um preço médio já pronto joga fora o histórico.

**Preço em dólar exige o câmbio daquele dia.** Sem ele a linha é recusada.
Chutar o câmbio corromperia o custo de forma permanente e silenciosa.

**Venda não precisa de preço médio.** Coloque o preço que você vendeu; o lucro
sai do ledger.

**Reimportar o mesmo arquivo não duplica nada.** Pode subir de novo com linhas
novas no fim — as antigas são reconhecidas e ignoradas.

## Salvando em CSV

O Excel oferece quatro tipos de CSV. Use **CSV UTF-8 (delimitado por vírgulas)**.

| Opção do Excel | Serve? |
|---|---|
| **CSV UTF-8 (delimitado por vírgulas)** | **Sim — use esta** |
| CSV (delimitado por vírgulas) | Funciona, mas estraga acento: *Ações* vira *Aç›es* |
| CSV (Macintosh) | Mesmo problema de acento |
| CSV (MS-DOS) | Pior: perde acento e caractere especial |

A diferença entre elas não é o separador — é a **codificação**. Só a UTF-8
guarda `ç`, `ã` e `é` corretamente. As outras três gravam num padrão dos anos
80 e o nome dos seus ativos chega embaralhado.

Nas outras planilhas:

- **LibreOffice:** Arquivo → Salvar como → **Texto CSV**, marque *Editar
  configurações de filtro*, escolha **UTF-8**
- **Google Planilhas:** Arquivo → Fazer download → **Valores separados por
  vírgulas** (já sai em UTF-8)

Não se preocupe com o separador: o sistema detecta ponto e vírgula, vírgula e
tabulação sozinho. Nem com o formato do número — `1.234,56` e `1,234.56` são
lidos corretamente, e a decisão é tomada pelo arquivo inteiro, não célula a
célula.

## Se o arquivo vem da corretora

**B3 (Área do Investidor):** exporte **Negociação** — a lista de compras e
vendas com data e preço. O extrato de **Posição** (Carteira de Ativos) *não
serve*: ele mostra só o que você tem hoje, sem data nem preço pago, e o "preço
de fechamento" que ele traz é o de hoje, não o do dia da compra. Importá-lo
faria sua carteira nascer com lucro zero.

**CoinMarketCap e corretoras de cripto:** exporte as *transações*, não o
portfólio. Um arquivo por carteira; o sistema sugere o nome da carteira a partir
do nome do arquivo.

## Depois de subir

O sistema mostra uma **pré-visualização** com tudo que entendeu, antes de gravar
qualquer coisa. Linhas com problema aparecem marcadas com o motivo e o número da
linha na planilha. Nada é importado até você confirmar.
