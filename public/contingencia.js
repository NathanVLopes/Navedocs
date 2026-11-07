
const formulario = document.getElementById("formContingencia");

function escaparHTML(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[caractere]);
}

formulario.addEventListener("submit", function (evento) {
  evento.preventDefault();

  if (!document.getElementById("teste").checked) {
    alert("Confirme que está utilizando exclusivamente dados fictícios.");
    return;
  }

  if (!formulario.reportValidity()) {
    return;
  }

  const dados = new FormData(formulario);

  const campo = nome => {
    const valor = String(dados.get(nome) ?? "").trim();
    return escaparHTML(valor || "Não informado");
  };

  const dataOriginal = dados.get("data");
  let dataFormatada = "Não informado";

  if (dataOriginal) {
    const data = new Date(dataOriginal);
    if (!Number.isNaN(data.getTime())) {
      dataFormatada = escaparHTML(
        data.toLocaleString("pt-BR")
      );
    }
  }

  const atendimento = {
    numero: campo("numero"),
    data: dataFormatada,
    servidor: campo("servidor"),
    nome: campo("nome"),
    cpf: "000.000.000-00",
    contato: campo("contato"),
    servico: campo("servico"),
    placa: campo("placa"),
    ait: campo("ait"),
    documentos: campo("documentos"),
    quantidade: campo("quantidade"),
    motivo: campo("motivo")
  };

  function gerarVia(titulo) {
    return `
      <section class="via">
        <header>
          <h1>NAVETRAN</h1>
          <h2>PROTOCOLO DE CONTINGÊNCIA</h2>
          <h3>${titulo}</h3>
        </header>

        <div class="identificacao">
          <p><strong>Número provisório:</strong> ${atendimento.numero}</p>
          <p><strong>Data e hora:</strong> ${atendimento.data}</p>
          <p><strong>Servidor responsável:</strong> ${atendimento.servidor}</p>
        </div>

        <hr>

        <h3>Identificação do cidadão</h3>
        <p><strong>Nome:</strong> ${atendimento.nome}</p>
        <p><strong>CPF de teste:</strong> ${atendimento.cpf}</p>
        <p><strong>Contato:</strong> ${atendimento.contato}</p>

        <hr>

        <h3>Dados do atendimento</h3>
        <p><strong>Serviço solicitado:</strong> ${atendimento.servico}</p>
        <p><strong>Placa:</strong> ${atendimento.placa}</p>
        <p><strong>Número do AIT:</strong> ${atendimento.ait}</p>
        <p><strong>Documentos recebidos:</strong></p>
        <div class="texto-longo">${atendimento.documentos}</div>
        <p><strong>Quantidade de documentos:</strong> ${atendimento.quantidade}</p>
        <p><strong>Motivo e observações:</strong></p>
        <div class="texto-longo">${atendimento.motivo}</div>

        <div class="aviso">
          <strong>IMPORTANTE:</strong>
          Este documento é um comprovante provisório de recebimento.
          Não representa protocolo oficial do Detran, não confirma
          a aceitação do pedido e não suspende ou prorroga prazos legais.
        </div>

        <div class="assinaturas">
          <div>
            ______________________________
            <span>Assinatura do cidadão</span>
          </div>
          <div>
            ______________________________
            <span>Assinatura do servidor</span>
          </div>
        </div>

        <footer>
          NAVETRAN | Documento provisório de contingência
        </footer>
      </section>
    `;
  }

  const janela = window.open("", "_blank");

  if (!janela) {
    alert(
      "A janela de impressão foi bloqueada. Permita pop-ups para este site e tente novamente."
    );
    return;
  }

  janela.document.open();

  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Protocolo de Contingência - NAVETRAN</title>

      <style>
        @page {
          size: A4 portrait;
          margin: 8mm;
        }

        * {
          box-sizing: border-box;
        }

        body {
          font-family: Arial, sans-serif;
          color: #222;
          margin: 0;
          font-size: 9pt;
        }

        .via {
          min-height: 125mm;
          padding: 2mm 1mm;
          position: relative;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        header {
          text-align: center;
          margin-bottom: 5px;
        }

        h1 {
          color: #12345a;
          font-size: 17pt;
          margin: 0 0 2px;
        }

        h2 {
          font-size: 11pt;
          margin: 0 0 2px;
        }

        h3 {
          font-size: 9pt;
          margin: 5px 0;
        }

        p {
          margin: 3px 0;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        hr {
          border: 0;
          border-top: 1px solid #aaa;
          margin: 5px 0;
        }

        .texto-longo {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          margin: 2px 0 4px;
          line-height: 1.2;
        }

        .aviso {
          border: 1px solid #555;
          padding: 5px;
          margin-top: 6px;
          font-size: 8pt;
          line-height: 1.25;
        }

        .assinaturas {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 16px;
          text-align: center;
          font-size: 8pt;
        }

        .assinaturas div {
          flex: 1;
          min-width: 0;
        }

        .assinaturas span {
          display: block;
          margin-top: 3px;
        }

        .corte {
          border-top: 1px dashed #555;
          text-align: center;
          padding-top: 3px;
          margin: 3mm 0;
          font-size: 8pt;
          page-break-inside: avoid;
        }

        footer {
          text-align: center;
          font-size: 7pt;
          margin-top: 8px;
          color: #555;
        }

        @media print {
          body {
            margin: 0;
          }

          .via {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      </style>
    </head>

    <body>
      ${gerarVia("VIA NAVETRAN")}

      <div class="corte">✂ LINHA DE CORTE</div>

      ${gerarVia("VIA DO CIDADÃO")}

      <script>
        window.onload = function () {
          window.focus();
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);

  janela.document.close();
});
