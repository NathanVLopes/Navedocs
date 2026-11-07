
const formulario = document.getElementById("formContingencia");
const resultado = document.getElementById("resultado");

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
    alert("Confirme que está utilizando dados fictícios.");
    return;
  }

  const dados = new FormData(formulario);
  const campo = nome => escaparHTML(dados.get(nome) || "Não informado");

  const atendimento = {
    numero: campo("numero"),
    data: campo("data"),
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

  const gerarVia = (titulo) => `
    <section class="via">
      <header>
        <h1>NAVETRAN</h1>
        <h2>PROTOCOLO DE CONTINGÊNCIA</h2>
        <h3>${titulo}</h3>
      </header>

      <p><strong>Número provisório:</strong> ${atendimento.numero}</p>
      <p><strong>Data e hora:</strong> ${atendimento.data}</p>
      <p><strong>Servidor:</strong> ${atendimento.servidor}</p>

      <hr>

      <h3>Identificação do cidadão</h3>
      <p><strong>Nome:</strong> ${atendimento.nome}</p>
      <p><strong>CPF de teste:</strong> ${atendimento.cpf}</p>
      <p><strong>Contato:</strong> ${atendimento.contato}</p>

      <hr>

      <h3>Atendimento</h3>
      <p><strong>Serviço:</strong> ${atendimento.servico}</p>
      <p><strong>Placa:</strong> ${atendimento.placa}</p>
      <p><strong>AIT:</strong> ${atendimento.ait}</p>
      <p><strong>Documentos:</strong> ${atendimento.documentos}</p>
      <p><strong>Quantidade:</strong> ${atendimento.quantidade}</p>
      <p><strong>Observações:</strong> ${atendimento.motivo}</p>

      <div class="aviso">
        <strong>IMPORTANTE:</strong>
        Este documento é um comprovante provisório de recebimento.
        Não representa protocolo oficial do Detran, não confirma
        aceitação do pedido e não suspende ou prorroga prazos legais.
      </div>

      <div class="assinaturas">
        <div>____________________________<br>Assinatura do cidadão</div>
        <div>____________________________<br>Assinatura do servidor</div>
      </div>
    </section>
  `;

  const janela = window.open("", "_blank");

  if (!janela) {
    alert("Permita janelas pop-up para imprimir as duas vias.");
    return;
  }

  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Protocolo de Contingência</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          color: #222;
          margin: 15mm;
        }

        .via {
          min-height: 120mm;
          padding-bottom: 12mm;
        }

        h1, h2, h3 {
          text-align: center;
        }

        h1 {
          color: #12345a;
        }

        p {
          font-size: 12px;
          line-height: 1.5;
        }

        .aviso {
          margin-top: 18px;
          padding: 12px;
          border: 1px solid #555;
          font-size: 11px;
          line-height: 1.5;
        }

        .assinaturas {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin-top: 35px;
          text-align: center;
          font-size: 11px;
        }

        .corte {
          border-top: 1px dashed #555;
          text-align: center;
          margin: 15px 0;
          padding-top: 5px;
          font-size: 10px;
        }

        @media print {
          body {
            margin: 10mm;
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
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);

  janela.document.close();
});
