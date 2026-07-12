/** Plantillas HTML simples. Separadas del transporte para poder testear/editar. */
export const MailTemplates = {
  welcome: (name: string) => ({
    subject: '¡Bienvenido a MiniWallet!',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2>Hola ${name} 👋</h2>
        <p>Tu cuenta MiniWallet fue creada con éxito.</p>
        <p>Ya puedes iniciar sesión y transferir saldo a otros usuarios.</p>
        <hr/>
        <small>Este es un correo automático, no respondas a este mensaje.</small>
      </div>`,
  }),

  transferReceived: (name: string, amount: number, from: string) => ({
    subject: `Recibiste una transferencia de $${amount.toFixed(2)}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2>Hola ${name}</h2>
        <p>Recibiste <b>$${amount.toFixed(2)} USD</b> de ${from}.</p>
        <p>El saldo ya está disponible en tu cuenta.</p>
      </div>`,
  }),

  passwordRecovery: (name: string, resetUrl: string) => ({
    subject: 'Recupera tu contraseña de MiniWallet',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2>Hola ${name}</h2>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p><a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Restablecer contraseña</a></p>
        <p>O copia este enlace: <br/><small>${resetUrl}</small></p>
        <p>El enlace vence en 1 hora. Si no fuiste tú, ignora este correo.</p>
      </div>`,
  }),

  passwordChanged: (name: string) => ({
    subject: 'Tu contraseña de MiniWallet fue actualizada',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2>Hola ${name}</h2>
        <p>Tu contraseña se cambió correctamente.</p>
        <p>Si <b>no</b> realizaste este cambio, contacta a soporte de inmediato.</p>
      </div>`,
  }),

  transferOtp: (name: string, code: string, amount: number) => ({
    subject: `Código para confirmar tu transferencia de $${amount.toFixed(2)}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2>Hola ${name}</h2>
        <p>Estás por transferir <b>$${amount.toFixed(2)} USD</b>. Por seguridad,
        confirma con este código:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center">${code}</p>
        <p>El código vence en unos minutos. Si no fuiste tú, ignora este correo y
        cambia tu contraseña.</p>
      </div>`,
  }),

  transferHeld: (name: string, amount: number) => ({
    subject: `Tu transferencia de $${amount.toFixed(2)} está en validación`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2>Hola ${name}</h2>
        <p>Tu transferencia de <b>$${amount.toFixed(2)} USD</b> superó el umbral de
        cumplimiento y está en proceso de validación.</p>
        <p>El monto ya fue descontado de tu saldo disponible y se confirmará al
        destinatario una vez aprobada.</p>
      </div>`,
  }),
};
