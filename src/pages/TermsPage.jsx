export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-16 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">
        Términos y Condiciones de Servicio
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        Última actualización: 15 de marzo de 2026
      </p>

      <div className="space-y-6 text-slate-700 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            1. Aceptación de los términos
          </h2>
          <p>
            Al acceder y utilizar la plataforma DistriMM ("el Servicio"),
            proporcionada por Luminia Tech Solutions, usted acepta estar sujeto
            a estos Términos y Condiciones. Si no está de acuerdo con alguna
            parte de estos términos, no podrá utilizar el Servicio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            2. Descripción del servicio
          </h2>
          <p>
            DistriMM es una plataforma SaaS de gestión de cartera y cobranza que
            permite a distribuidoras colombianas:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Cargar y analizar datos de cartera financiera.</li>
            <li>
              Enviar recordatorios de pago automatizados a través de WhatsApp
              Business API.
            </li>
            <li>Gestionar plantillas de mensajes de cobranza.</li>
            <li>Visualizar análisis financieros y reportes de cartera.</li>
            <li>Administrar directorio de clientes y vendedores.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            3. Cuenta de usuario
          </h2>
          <p>
            El usuario es responsable de mantener la confidencialidad de sus
            credenciales de acceso. Toda actividad realizada bajo su cuenta será
            responsabilidad del titular. Debe notificar inmediatamente cualquier
            uso no autorizado de su cuenta.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            4. Uso aceptable
          </h2>
          <p>El usuario se compromete a:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              Utilizar el Servicio únicamente para fines legítimos de cobranza y
              gestión de cartera.
            </li>
            <li>
              No enviar mensajes de spam, acoso o contenido ilegal a través de
              la plataforma.
            </li>
            <li>
              Cumplir con las políticas de WhatsApp Business y Meta Platform.
            </li>
            <li>
              Respetar los horarios de envío establecidos (7am - 9pm hora
              Colombia).
            </li>
            <li>
              No exceder los límites de envío diario configurados en la
              plataforma.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            5. WhatsApp Business
          </h2>
          <p>
            El uso de la funcionalidad de mensajería de WhatsApp está sujeto a
            los términos y políticas de Meta Platforms, Inc. El usuario es
            responsable de obtener el consentimiento de sus clientes para
            recibir mensajes a través de WhatsApp. Luminia Tech Solutions no se
            responsabiliza por el bloqueo o restricción de cuentas de WhatsApp
            Business debido al uso indebido por parte del usuario.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            6. Propiedad de los datos
          </h2>
          <p>
            Los datos cargados por el usuario (cartera, clientes, ventas) son
            propiedad exclusiva del usuario. Luminia Tech Solutions no reclama
            propiedad sobre estos datos y los trata únicamente como encargado
            del tratamiento para proveer el servicio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            7. Disponibilidad del servicio
          </h2>
          <p>
            Nos esforzamos por mantener el Servicio disponible de forma
            continua. Sin embargo, no garantizamos disponibilidad ininterrumpida
            y no seremos responsables por interrupciones temporales debido a
            mantenimiento, actualizaciones o causas de fuerza mayor.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            8. Limitación de responsabilidad
          </h2>
          <p>
            Luminia Tech Solutions no será responsable por daños indirectos,
            incidentales o consecuentes derivados del uso del Servicio,
            incluyendo pero no limitado a pérdida de ingresos, pérdida de datos
            o interrupción del negocio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            9. Modificaciones
          </h2>
          <p>
            Nos reservamos el derecho de modificar estos términos en cualquier
            momento. Los cambios serán notificados a través de la plataforma. El
            uso continuado del Servicio después de los cambios constituye
            aceptación de los términos modificados.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            10. Legislación aplicable
          </h2>
          <p>
            Estos términos se rigen por las leyes de la República de Colombia.
            Cualquier controversia será resuelta ante los tribunales competentes
            de Colombia.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            11. Contacto
          </h2>
          <p>
            Para consultas sobre estos términos: operacion@luminiatech.digital
          </p>
        </section>
      </div>
    </div>
  );
}
