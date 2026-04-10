export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-16 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">
        Política de Privacidad
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        Última actualización: 15 de marzo de 2026
      </p>

      <div className="space-y-6 text-slate-700 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            1. Responsable del tratamiento
          </h2>
          <p>
            Luminia Tech Solutions, con domicilio en Colombia, es responsable
            del tratamiento de los datos personales recopilados a través de la
            plataforma DistriMM (en adelante, "la Plataforma").
          </p>
          <p className="mt-2">
            Correo de contacto: operacion@luminiatech.digital
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            2. Datos que recopilamos
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Datos de registro: correo electrónico y contraseña.</li>
            <li>
              Datos de cartera: información financiera de clientes (NIT, nombre,
              facturas, saldos, fechas de vencimiento) cargada voluntariamente
              por el usuario.
            </li>
            <li>
              Datos de contacto de clientes: números de teléfono y nombres
              utilizados para el envío de mensajes de WhatsApp.
            </li>
            <li>
              Datos de uso de WhatsApp Business: phone_number_id, waba_id,
              estado de conexión, estadísticas de envío de mensajes.
            </li>
            <li>
              Datos técnicos: dirección IP, tipo de navegador, páginas
              visitadas, para fines de seguridad y mejora del servicio.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            3. Finalidad del tratamiento
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Proveer el servicio de gestión de cartera y cobranza automatizada.
            </li>
            <li>
              Enviar recordatorios de pago a los clientes del usuario vía
              WhatsApp Business API.
            </li>
            <li>Generar análisis y reportes financieros para el usuario.</li>
            <li>
              Administrar la conexión de WhatsApp Business del usuario mediante
              Meta Embedded Signup.
            </li>
            <li>Garantizar la seguridad y estabilidad de la plataforma.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            4. Base legal
          </h2>
          <p>
            El tratamiento de datos se realiza con base en el consentimiento del
            usuario al registrarse y aceptar estos términos, y en el interés
            legítimo de prestar el servicio contratado, conforme a la Ley 1581
            de 2012 (Colombia) y el Reglamento General de Protección de Datos
            (RGPD) cuando aplique.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            5. Compartición de datos
          </h2>
          <p>
            Los datos pueden ser compartidos con los siguientes encargados del
            tratamiento:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>Supabase Inc.</strong> — Almacenamiento de base de datos y
              autenticación.
            </li>
            <li>
              <strong>Meta Platforms, Inc.</strong> — Envío de mensajes a través
              de WhatsApp Business API.
            </li>
          </ul>
          <p className="mt-2">
            No vendemos, alquilamos ni compartimos datos personales con terceros
            para fines de marketing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            6. Retención de datos
          </h2>
          <p>
            Los datos se conservan mientras la cuenta del usuario esté activa.
            El usuario puede solicitar la eliminación de sus datos en cualquier
            momento contactándonos a operacion@luminiatech.digital.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            7. Derechos del titular
          </h2>
          <p>El usuario tiene derecho a:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Acceder a sus datos personales.</li>
            <li>Rectificar datos inexactos o incompletos.</li>
            <li>Solicitar la eliminación de sus datos.</li>
            <li>Revocar el consentimiento otorgado.</li>
            <li>
              Presentar quejas ante la Superintendencia de Industria y Comercio
              (Colombia).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            8. Seguridad
          </h2>
          <p>
            Implementamos medidas técnicas y organizativas para proteger los
            datos personales, incluyendo cifrado en tránsito (HTTPS/TLS),
            autenticación segura, y control de acceso basado en roles (RLS) a
            nivel de base de datos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            9. Contacto
          </h2>
          <p>
            Para ejercer sus derechos o realizar consultas sobre esta política,
            contacte a: operacion@luminiatech.digital
          </p>
        </section>
      </div>
    </div>
  );
}
