export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-16 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">
        Eliminación de Datos de Usuario
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        Última actualización: 15 de marzo de 2026
      </p>

      <div className="space-y-6 text-slate-700 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Cómo solicitar la eliminación de tus datos
          </h2>
          <p>
            En cumplimiento con la Ley 1581 de 2012 (Colombia), el Reglamento
            General de Protección de Datos (RGPD) y las políticas de Meta
            Platforms, puedes solicitar la eliminación de todos tus datos
            personales almacenados en DistriMM.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Proceso de eliminación
          </h2>
          <p>Para solicitar la eliminación de tus datos, sigue estos pasos:</p>
          <ol className="list-decimal pl-5 space-y-2 mt-3">
            <li>
              Envía un correo electrónico a{" "}
              <a
                href="mailto:operacion@luminiatech.digital"
                className="text-blue-600 underline"
              >
                operacion@luminiatech.digital
              </a>{" "}
              con el asunto <strong>"Solicitud de eliminación de datos"</strong>
              .
            </li>
            <li>
              Incluye en el correo tu dirección de email registrada en la
              plataforma y el nombre de tu empresa.
            </li>
            <li>
              Recibirás una confirmación de recepción dentro de las siguientes
              48 horas hábiles.
            </li>
            <li>
              La eliminación de tus datos se completará en un plazo máximo de 15
              días hábiles.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Datos que se eliminarán
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Tu cuenta de usuario y credenciales de acceso.</li>
            <li>
              Datos de cartera cargados (historial de cargas, items de cartera).
            </li>
            <li>Datos de clientes y directorio (nombres, teléfonos, NITs).</li>
            <li>Historial de mensajes enviados y plantillas creadas.</li>
            <li>
              Conexión de WhatsApp Business (phone_number_id, waba_id, tokens).
            </li>
            <li>Datos de comisiones y ventas.</li>
            <li>Sesiones de chat y análisis CFO.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Datos que podemos retener
          </h2>
          <p>
            Podremos retener ciertos datos de forma anonimizada y agregada para
            fines estadísticos, o cuando exista una obligación legal de
            conservación (por ejemplo, registros contables conforme a la
            legislación colombiana). Estos datos no permitirán identificar al
            usuario.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Confirmación
          </h2>
          <p>
            Una vez completada la eliminación, recibirás un correo de
            confirmación indicando que todos tus datos personales han sido
            removidos de nuestros sistemas.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Contacto
          </h2>
          <p>
            Si tienes preguntas sobre el proceso de eliminación de datos,
            contáctanos en:{" "}
            <a
              href="mailto:operacion@luminiatech.digital"
              className="text-blue-600 underline"
            >
              operacion@luminiatech.digital
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
