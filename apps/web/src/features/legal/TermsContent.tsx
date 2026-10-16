import type { ReactNode } from 'react';
import type { CompanyInfo } from '@/lib/types';

/** Data da versão no formato da API (AAAA-MM-DD) → DD/MM/AAAA. */
const formatVersion = (version: string) => version.split('-').reverse().join('/');

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-slate-900">
        {n}. {title}
      </h3>
      {children}
    </section>
  );
}

const List = ({ children }: { children: ReactNode }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>;

/**
 * Termo de Uso e Política de Privacidade do V&L Estoque, com foco no tratamento dos dados pessoais
 * dos usuários (LGPD — Lei nº 13.709/2018). Ao alterar este texto de forma relevante, troque também
 * TERMS_VERSION na API (apps/api/src/modules/legal/terms.ts) para pedir uma nova ciência.
 */
export function TermsContent({ company, version }: { company: CompanyInfo; version: string }) {
  const pending = <em className="text-amber-700">[a preencher em Configurações]</em>;
  const name = company.name || 'a empresa usuária do sistema';
  const dpo = company.dpoName ? (
    <>
      <b>{company.dpoName}</b>
      {company.dpoEmail && (
        <>
          {' '}
          (<a className="text-brand-700 underline" href={`mailto:${company.dpoEmail}`}>{company.dpoEmail}</a>)
        </>
      )}
    </>
  ) : (
    pending
  );

  return (
    <div className="space-y-6 text-sm leading-relaxed text-slate-700">
      <p className="text-xs text-slate-500">Versão de {formatVersion(version)}</p>

      <Section n={1} title="Sobre este termo">
        <p>
          Este Termo de Uso e Política de Privacidade explica as regras de uso do sistema <b>V&amp;L Estoque</b> e como os
          dados pessoais de quem o utiliza são tratados, em conformidade com a Lei Geral de Proteção de Dados Pessoais
          (LGPD — Lei nº 13.709/2018).
        </p>
        <p>
          Ao criar a sua senha no primeiro acesso, você declara que <b>leu e concorda com as regras de uso</b> e que está{' '}
          <b>ciente de como os seus dados são tratados</b>. Sempre que este documento mudar de forma relevante, o sistema
          pedirá uma nova leitura.
        </p>
      </Section>

      <Section n={2} title="Quem é o responsável pelos dados (controlador)">
        <p>
          O controlador dos dados pessoais é <b>{name}</b>
          {company.cnpj ? <>, inscrita no CNPJ sob o nº {company.cnpj}</> : <>, CNPJ {pending}</>}
          {company.address ? <>, com sede em {company.address}</> : null}. É ela quem decide como e por que os dados são
          tratados no sistema.
        </p>
        <p>
          O encarregado pelo tratamento de dados pessoais (art. 41 da LGPD), canal de contato para qualquer assunto deste
          termo, é {dpo}.
        </p>
        <p>
          O V&amp;L Estoque funciona <b>no computador da própria empresa</b>. O desenvolvedor do software não recebe, não
          acessa e não armazena os dados cadastrados.
        </p>
      </Section>

      <Section n={3} title="A quem este termo se aplica">
        <p>
          A todas as pessoas com usuário no sistema (administradores, estoquistas e caixas), chamadas aqui de “usuários”
          ou “titulares”. O sistema é de uso interno da empresa e não coleta dados de clientes do mercadinho.
        </p>
      </Section>

      <Section n={4} title="Quais dados pessoais são tratados">
        <List>
          <li>
            <b>Identificação:</b> nome completo, login (usuário) e perfil de acesso.
          </li>
          <li>
            <b>Contato:</b> e-mail, usado <u>somente</u> para recuperar a senha. É obrigatório para administradores e
            opcional para os demais.
          </li>
          <li>
            <b>Credenciais:</b> senha e PIN, guardados apenas como <i>hash</i> com o algoritmo Argon2id. É uma forma
            irreversível: ninguém, nem o administrador, consegue ver a sua senha ou o seu PIN.
          </li>
          <li>
            <b>Registros de uso (auditoria):</b> ações feitas no sistema (login, cadastros, entradas, saídas, exclusões,
            alterações), com data, hora e endereço IP do aparelho.
          </li>
          <li>
            <b>Operações de estoque:</b> as movimentações e solicitações de pedido ficam vinculadas a quem as registrou.
          </li>
          <li>
            <b>Segurança da conta:</b> data do último acesso, tentativas de login erradas, bloqueios temporários e
            códigos de recuperação de senha (guardados como <i>hash</i> e válidos por 15 minutos).
          </li>
          <li>
            <b>Ciência deste termo:</b> versão lida e data.
          </li>
        </List>
        <p>
          <b>Não</b> são coletados CPF, documentos, endereço residencial, telefone, fotos, biometria, localização ou dados
          pessoais sensíveis (art. 5º, II, da LGPD).
        </p>
      </Section>

      <Section n={5} title="Para que os dados são usados e com qual base legal">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-200 p-2">Finalidade</th>
                <th className="border border-slate-200 p-2">Dados</th>
                <th className="border border-slate-200 p-2">Base legal (LGPD, art. 7º)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-200 p-2">Dar acesso ao sistema conforme a função de cada pessoa</td>
                <td className="border border-slate-200 p-2">Identificação e credenciais</td>
                <td className="border border-slate-200 p-2">Execução de contrato (inciso V)</td>
              </tr>
              <tr>
                <td className="border border-slate-200 p-2">Registrar quem fez cada operação de estoque (rastreabilidade)</td>
                <td className="border border-slate-200 p-2">Identificação e operações</td>
                <td className="border border-slate-200 p-2">Legítimo interesse (IX) e cumprimento de obrigação legal (II)</td>
              </tr>
              <tr>
                <td className="border border-slate-200 p-2">Proteger o sistema contra acessos indevidos e fraudes</td>
                <td className="border border-slate-200 p-2">Auditoria, IP e segurança da conta</td>
                <td className="border border-slate-200 p-2">Legítimo interesse (IX)</td>
              </tr>
              <tr>
                <td className="border border-slate-200 p-2">Recuperar a senha esquecida</td>
                <td className="border border-slate-200 p-2">E-mail e código de recuperação</td>
                <td className="border border-slate-200 p-2">Execução de contrato (V) e legítimo interesse (IX)</td>
              </tr>
              <tr>
                <td className="border border-slate-200 p-2">Defesa da empresa em processos administrativos ou judiciais</td>
                <td className="border border-slate-200 p-2">Auditoria e operações</td>
                <td className="border border-slate-200 p-2">Exercício regular de direitos (VI)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Os dados <b>não</b> são usados para publicidade, não são vendidos e não passam por decisões automatizadas que
          afetem os seus interesses.
        </p>
      </Section>

      <Section n={6} title="Compartilhamento e transferência internacional">
        <p>Os dados ficam no computador da empresa. Eles só saem dele nas situações abaixo:</p>
        <List>
          <li>
            <b>Backup na nuvem:</b> se a empresa ativar o backup no Google Drive (ou em outra pasta sincronizada), uma
            cópia do banco de dados é guardada na conta de nuvem da própria empresa, sujeita aos termos desse provedor.
          </li>
          <li>
            <b>E-mail de recuperação:</b> o código é enviado pelo provedor de e-mail configurado pela empresa (por
            exemplo, Gmail).
          </li>
          <li>
            <b>Autoridades:</b> quando houver obrigação legal ou ordem judicial.
          </li>
        </List>
        <p>
          Provedores de nuvem e de e-mail podem manter servidores fora do Brasil. Nesses casos, a transferência
          internacional segue o art. 33 da LGPD, com provedores que oferecem garantias de proteção compatíveis.
        </p>
      </Section>

      <Section n={7} title="Como os dados são protegidos">
        <List>
          <li>Senhas e PINs com <i>hash</i> Argon2id; ninguém tem acesso ao valor original.</li>
          <li>Bloqueio automático após tentativas erradas de senha (15 minutos) e de PIN (5 minutos).</li>
          <li>Perfis de acesso: cada pessoa só vê e faz o que a sua função exige.</li>
          <li>Sessão protegida por cookie inacessível a scripts, com encerramento ao trocar a senha.</li>
          <li>PIN pessoal para confirmar operações sensíveis.</li>
          <li>Banco de dados acessível somente pelo próprio computador; senha do e-mail de envio guardada criptografada.</li>
          <li>Registro de auditoria de todas as operações e backups automáticos.</li>
        </List>
      </Section>

      <Section n={8} title="Por quanto tempo os dados são guardados">
        <List>
          <li>
            <b>Dados da conta:</b> enquanto o usuário tiver acesso ao sistema. Depois da desativação, podem ser{' '}
            <b>anonimizados</b> pelo administrador ou a pedido do titular, respeitadas as hipóteses de guarda do art. 16 da
            LGPD.
          </li>
          <li>
            <b>Endereço IP na auditoria:</b> apagado automaticamente após <b>12 meses</b>.
          </li>
          <li>
            <b>Códigos de recuperação de senha:</b> valem 15 minutos e são apagados em até 1 dia.
          </li>
          <li>
            <b>Movimentações de estoque e auditoria:</b> pelo tempo necessário ao controle do estoque e ao cumprimento de
            obrigações legais, fiscais e trabalhistas. Após a anonimização, elas continuam no histórico <b>sem identificar a
            pessoa</b>.
          </li>
          <li>
            <b>Backups:</b> os 30 dias mais recentes.
          </li>
        </List>
      </Section>

      <Section n={9} title="Seus direitos como titular (LGPD, art. 18)">
        <p>Você pode, a qualquer momento:</p>
        <List>
          <li>confirmar se os seus dados são tratados e <b>acessá-los</b>;</li>
          <li>
            <b>corrigir</b> dados incompletos, inexatos ou desatualizados;
          </li>
          <li>
            pedir a <b>anonimização, o bloqueio ou a eliminação</b> de dados desnecessários, excessivos ou tratados em
            desconformidade com a lei;
          </li>
          <li>
            receber os seus dados em formato estruturado (<b>portabilidade</b>);
          </li>
          <li>saber com quem os dados são compartilhados;</li>
          <li>
            <b>opor-se</b> a tratamento feito sem atender à LGPD;
          </li>
          <li>apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</li>
        </List>
        <p>
          <b>Como exercer:</b> em <b>Meu perfil</b> você baixa uma cópia dos seus dados (“Baixar meus dados”) e corrige o
          seu e-mail. Para os demais pedidos, fale com o encarregado ({dpo}) ou com um administrador. A resposta será dada
          em até <b>15 dias</b> (art. 19, II, da LGPD).
        </p>
      </Section>

      <Section n={10} title="Regras de uso do sistema">
        <p>Ao usar o V&amp;L Estoque, você se compromete a:</p>
        <List>
          <li>
            manter a sua <b>senha e o seu PIN em sigilo</b> e não compartilhá-los com ninguém, nem com colegas;
          </li>
          <li>usar somente o seu próprio usuário e sair do sistema (“Sair”) ao terminar, em computadores compartilhados;</li>
          <li>registrar as operações de estoque de forma verdadeira e no momento em que acontecem;</li>
          <li>usar o sistema apenas para as atividades da empresa;</li>
          <li>não tentar acessar funções ou dados além do seu perfil, nem burlar os mecanismos de segurança;</li>
          <li>avisar um administrador imediatamente se suspeitar que alguém conhece a sua senha ou o seu PIN.</li>
        </List>
        <p>
          Como todas as operações ficam registradas com o seu usuário, ações feitas com a sua senha ou o seu PIN são de sua
          responsabilidade. O descumprimento destas regras pode levar ao bloqueio do acesso, sem prejuízo das medidas
          previstas na legislação trabalhista e civil.
        </p>
      </Section>

      <Section n={11} title="Incidentes de segurança">
        <p>
          Se houver um incidente de segurança que possa causar risco ou dano relevante aos titulares, a empresa comunicará
          a ANPD e as pessoas afetadas, conforme o art. 48 da LGPD, informando o ocorrido e as medidas adotadas.
        </p>
      </Section>

      <Section n={12} title="Cookies e armazenamento no aparelho">
        <p>
          O sistema usa apenas um <b>cookie essencial de sessão</b>, que mantém você conectado por até 12 horas. No
          navegador ficam também preferências de uso e, no celular, as operações feitas sem conexão até serem enviadas.
          Não há cookies de publicidade nem de rastreamento.
        </p>
      </Section>

      <Section n={13} title="Alterações deste termo">
        <p>
          Este termo pode ser atualizado para refletir mudanças no sistema ou na legislação. A versão vigente fica sempre
          disponível em “Termos e privacidade”, no menu. Mudanças relevantes exigirão uma nova leitura no próximo acesso.
        </p>
      </Section>

      <Section n={14} title="Legislação e foro">
        <p>
          Este termo é regido pelas leis brasileiras. Fica eleito o foro da comarca da sede de {name} para resolver
          eventuais questões, salvo disposição legal em contrário.
        </p>
      </Section>
    </div>
  );
}
