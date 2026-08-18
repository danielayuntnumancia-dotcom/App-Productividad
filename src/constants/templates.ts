import { ExpedienteTemplate } from '../types';

export const EXPEDIENT_TEMPLATES: ExpedienteTemplate[] = [
  {
    id: "contrato_menor",
    name: "Tramitación Contrato Menor",
    concejalia: "Economía y Hacienda",
    masterCategory: "Economía y Hacienda",
    tasks: [
      { 
        title: "Requerimiento y Entrega de Documentación", 
        notes: "Comprobar recepción de:\n- Presupuestos\n- Modelo Declaración Responsable\n- Certificado de la AEAT\n- Certificado de la TGSS\n- Certificado titularidad cuenta bancaria / Ficha de terceros", 
        status: "todo", 
        estimatedTimeMin: 30 
      },
      { 
        title: "Rellenar documentación de contrato menor", 
        status: "todo", 
        estimatedTimeMin: 45 
      },
      { 
        title: "Enviar correo a Zaira y Ana", 
        status: "todo", 
        estimatedTimeMin: 10 
      },
      { 
        title: "Firma en Gestiona", 
        status: "waiting_on_third_party", 
        blockedBy: "Plataforma Gestiona / Funcionario", 
        estimatedTimeMin: 15 
      }
    ]
  },
  {
    id: "limpieza_parcela",
    name: "Requerimiento Limpieza Parcela",
    concejalia: "Medio Ambiente",
    masterCategory: "Medio Ambiente",
    tasks: [
      { 
        title: "Informe fotográfico e inspección", 
        status: "todo", 
        estimatedTimeMin: 45 
      },
      { 
        title: "Redacción requerimiento a propietario", 
        status: "todo", 
        estimatedTimeMin: 20 
      },
      { 
        title: "Notificación oficial", 
        status: "waiting_on_third_party", 
        blockedBy: "Servicios Administrativos", 
        estimatedTimeMin: 10 
      }
    ]
  }
];
