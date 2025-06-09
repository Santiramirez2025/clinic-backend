// scripts/seed-services.js - Seed para servicios de clínica estética
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const services = [
  // TRATAMIENTOS FACIALES
  {
    name: 'Limpieza Facial Profunda',
    description: 'Eliminación de impurezas, puntos negros y células muertas. Incluye extracción, mascarilla hidratante y protector solar.',
    category: 'FACIAL',
    duration: 60,
    price: 8500,
    isActive: true,
    features: ['Extracción de comedones', 'Mascarilla purificante', 'Hidratación profunda', 'Protector solar'],
    benefits: ['Piel más limpia', 'Poros desobstruidos', 'Textura mejorada', 'Luminosidad natural'],
    contraindications: ['Acné inflamatorio severo', 'Rosácea activa', 'Herpes labial activo'],
    aftercare: ['Evitar maquillaje 24h', 'No tocar la zona tratada', 'Usar protector solar', 'Hidratación constante']
  },
  {
    name: 'Peeling Químico Superficial',
    description: 'Exfoliación química suave con ácidos frutales para renovar la piel y mejorar textura y luminosidad.',
    category: 'FACIAL',
    duration: 45,
    price: 12000,
    isActive: true,
    features: ['Ácido glicólico 20%', 'Neutralización segura', 'Mascarilla calmante', 'Crema regeneradora'],
    benefits: ['Renovación celular', 'Reducción de manchas', 'Textura uniforme', 'Mayor luminosidad'],
    contraindications: ['Embarazo', 'Lactancia', 'Piel sensible', 'Exposición solar reciente'],
    aftercare: ['Protector solar obligatorio', 'No exfoliar por 1 semana', 'Hidratación intensa', 'Evitar sol directo']
  },
  {
    name: 'Hidrofacial con Vitamina C',
    description: 'Tratamiento de hidratación profunda con infusión de vitamina C y ácido hialurónico mediante tecnología avanzada.',
    category: 'FACIAL',
    duration: 75,
    price: 15000,
    isActive: true,
    features: ['Limpieza con agua activada', 'Exfoliación suave', 'Infusión de vitamina C', 'Masaje facial'],
    benefits: ['Hidratación intensa', 'Antioxidante potente', 'Luminosidad inmediata', 'Reducción de líneas finas'],
    contraindications: ['Alergia a vitamina C', 'Heridas abiertas', 'Infecciones cutáneas'],
    aftercare: ['Mantener hidratación', 'Protección solar', 'No usar retinol por 3 días', 'Agua termal refrescante']
  },

  // TRATAMIENTOS CORPORALES  
  {
    name: 'Masaje Relajante Corporal',
    description: 'Masaje terapéutico de cuerpo completo con aceites esenciales para liberar tensiones y estrés.',
    category: 'CORPORAL',
    duration: 90,
    price: 18000,
    isActive: true,
    features: ['Aceites esenciales premium', 'Técnicas suecas', 'Ambiente relajante', 'Música terapéutica'],
    benefits: ['Reducción del estrés', 'Mejora circulación', 'Relajación muscular', 'Bienestar general'],
    contraindications: ['Fiebre', 'Infecciones', 'Heridas abiertas', 'Varices severas'],
    aftercare: ['Hidratación abundante', 'Descanso', 'Evitar ejercicio intenso', 'Ducha tibia']
  },
  {
    name: 'Tratamiento Anticelulítico',
    description: 'Protocolo intensivo para reducir celulitis con radiofrecuencia, drenaje linfático y productos específicos.',
    category: 'CORPORAL',
    duration: 120,
    price: 25000,
    isActive: true,
    features: ['Radiofrecuencia bipolar', 'Drenaje linfático manual', 'Productos reductores', 'Vendas frías'],
    benefits: ['Reducción de celulitis', 'Mejora textura piel', 'Drenaje de toxinas', 'Reafirmación'],
    contraindications: ['Embarazo', 'Marcapasos', 'Trombosis', 'Cáncer'],
    aftercare: ['Ejercicio regular', 'Dieta balanceada', 'Hidratación', 'Masajes caseros']
  },

  // TRATAMIENTOS LÁSER
  {
    name: 'Depilación Láser Piernas Completas',
    description: 'Eliminación permanente del vello en piernas completas con tecnología láser de diodo de última generación.',
    category: 'LASER',
    duration: 60,
    price: 22000,
    isActive: true,
    features: ['Láser de diodo 808nm', 'Sistema de enfriamiento', 'Múltiples fototipos', 'Resultados permanentes'],
    benefits: ['Eliminación permanente', 'Piel suave', 'Sin vellos encarnados', 'Ahorro a largo plazo'],
    contraindications: ['Embarazo', 'Bronceado reciente', 'Medicamentos fotosensibilizantes', 'Queloides'],
    aftercare: ['Evitar sol por 2 semanas', 'No depilarse entre sesiones', 'Hidratación diaria', 'Protector solar']
  },
  {
    name: 'Rejuvenecimiento Facial con IPL',
    description: 'Tratamiento de fotorrejuvenecimiento para manchas, rosácea y mejora general de la textura de la piel.',
    category: 'LASER',
    duration: 45,
    price: 18000,
    isActive: true,
    features: ['Luz pulsada intensa', 'Filtros específicos', 'Gel conductor', 'Sistema de enfriamiento'],
    benefits: ['Reducción de manchas', 'Mejora rosácea', 'Estimula colágeno', 'Textura uniforme'],
    contraindications: ['Embarazo', 'Bronceado', 'Medicamentos fotosensibles', 'Melasma severo'],
    aftercare: ['Protección solar estricta', 'Hidratación', 'No exfoliar por 1 semana', 'Cremas calmantes']
  },

  // MEDICINA ESTÉTICA
  {
    name: 'Aplicación de Ácido Hialurónico Labial',
    description: 'Aumento y definición labial con ácido hialurónico de alta calidad para resultados naturales.',
    category: 'MEDICINA_ESTETICA',
    duration: 30,
    price: 35000,
    isActive: true,
    features: ['Ácido hialurónico reticulado', 'Anestesia tópica', 'Técnica microcánula', 'Resultados inmediatos'],
    benefits: ['Volumen natural', 'Hidratación labial', 'Resultados duraderos', 'Mínima molestia'],
    contraindications: ['Embarazo', 'Lactancia', 'Herpes labial activo', 'Alergias conocidas'],
    aftercare: ['Hielo las primeras horas', 'No besar por 24h', 'Evitar ejercicio intenso', 'Hidratación labial']
  },
  {
    name: 'Toxina Botulínica - Entrecejo',
    description: 'Aplicación de toxina botulínica para suavizar arrugas de expresión en zona del entrecejo.',
    category: 'MEDICINA_ESTETICA',
    duration: 20,
    price: 28000,
    isActive: true,
    features: ['Botox original', 'Técnica precisa', 'Agujas ultrafinas', 'Resultados graduales'],
    benefits: ['Suaviza arrugas', 'Previene nuevas líneas', 'Efecto natural', 'Duración 4-6 meses'],
    contraindications: ['Embarazo', 'Lactancia', 'Enfermedades neuromusculares', 'Infección local'],
    aftercare: ['No acostarse 4 horas', 'No ejercicio intenso', 'No masajear zona', 'Paciencia con resultados']
  },

  // TRATAMIENTOS VIP
  {
    name: 'Ritual Facial Diamante VIP',
    description: 'Experiencia premium con microdermoabrasión diamante, mascarilla de oro y masaje facial exclusivo.',
    category: 'VIP',
    duration: 120,
    price: 45000,
    isActive: true,
    isVipOnly: true,
    features: ['Microdermoabrasión diamante', 'Mascarilla de oro 24k', 'Masaje facial premium', 'Ambiente exclusivo'],
    benefits: ['Renovación celular máxima', 'Luminosidad excepcional', 'Experiencia de lujo', 'Resultados inmediatos'],
    contraindications: ['Piel muy sensible', 'Rosácea severa', 'Heridas abiertas'],
    aftercare: ['Cuidados premium incluidos', 'Productos de mantenimiento', 'Seguimiento personalizado']
  },
  {
    name: 'Paquete Corporal Detox VIP',
    description: 'Tratamiento completo de desintoxicación corporal con envolturas, drenaje linfático y sauna infrarroja.',
    category: 'VIP',
    duration: 150,
    price: 55000,
    isActive: true,
    isVipOnly: true,
    features: ['Envoltura detox', 'Drenaje linfático completo', 'Sauna infrarroja', 'Hidratación premium'],
    benefits: ['Eliminación de toxinas', 'Reducción de medidas', 'Relajación profunda', 'Piel renovada'],
    contraindications: ['Embarazo', 'Problemas cardíacos', 'Presión arterial alta'],
    aftercare: ['Hidratación constante', 'Dieta liviana', 'Descanso', 'Productos de mantenimiento']
  },

  // TRATAMIENTOS ESPECIALES
  {
    name: 'Radiofrecuencia Facial',
    description: 'Tratamiento de reafirmación facial con radiofrecuencia monopolar para estimular la producción de colágeno.',
    category: 'FACIAL',
    duration: 60,
    price: 20000,
    isActive: true,
    features: ['Radiofrecuencia monopolar', 'Control de temperatura', 'Gel conductor', 'Masaje final'],
    benefits: ['Reafirmación facial', 'Estimula colágeno', 'Mejora flacidez', 'Sin tiempo recuperación'],
    contraindications: ['Embarazo', 'Marcapasos', 'Implantes metálicos', 'Cáncer'],
    aftercare: ['Hidratación intensa', 'Protección solar', 'Evitar calor extremo', 'Masajes suaves']
  },
  {
    name: 'Mesoterapia Facial',
    description: 'Revitalización facial mediante microinyecciones de vitaminas, minerales y ácido hialurónico.',
    category: 'MEDICINA_ESTETICA',
    duration: 45,
    price: 32000,
    isActive: true,
    features: ['Microinyecciones precisas', 'Cóctel vitamínico', 'Ácido hialurónico', 'Técnica francesa'],
    benefits: ['Hidratación profunda', 'Luminosidad', 'Mejora textura', 'Estimula renovación'],
    contraindications: ['Embarazo', 'Lactancia', 'Alergias', 'Infecciones activas'],
    aftercare: ['Evitar maquillaje 24h', 'No tocar la zona', 'Protección solar', 'Hidratación']
  }
];

async function seedServices() {
  try {
    console.log('🌱 Iniciando seed de servicios...');

    // Obtener la primera clínica para asociar los servicios
    const clinic = await prisma.clinic.findFirst();
    
    if (!clinic) {
      console.error('❌ No se encontraron clínicas. Ejecuta primero el seed principal.');
      return;
    }

    console.log(`📍 Asociando servicios a clínica: ${clinic.name}`);

    // Limpiar servicios existentes
    await prisma.service.deleteMany({});
    console.log('🗑️ Servicios existentes eliminados');

    // Crear servicios
    const createdServices = [];
    
    for (const serviceData of services) {
      const service = await prisma.service.create({
        data: {
          ...serviceData,
          clinicId: clinic.id
        }
      });
      createdServices.push(service);
      console.log(`✅ Servicio creado: ${service.name} - $${service.price}`);
    }

    console.log('\n📊 Resumen de servicios creados:');
    console.log(`• Total de servicios: ${createdServices.length}`);
    console.log(`• Servicios faciales: ${createdServices.filter(s => s.category === 'FACIAL').length}`);
    console.log(`• Servicios corporales: ${createdServices.filter(s => s.category === 'CORPORAL').length}`);
    console.log(`• Servicios láser: ${createdServices.filter(s => s.category === 'LASER').length}`);
    console.log(`• Medicina estética: ${createdServices.filter(s => s.category === 'MEDICINA_ESTETICA').length}`);
    console.log(`• Servicios VIP: ${createdServices.filter(s => s.category === 'VIP').length}`);
    
    console.log('\n💰 Rango de precios:');
    const prices = createdServices.map(s => s.price);
    console.log(`• Precio mínimo: $${Math.min(...prices)}`);
    console.log(`• Precio máximo: $${Math.max(...prices)}`);
    console.log(`• Precio promedio: $${Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)}`);

    console.log('\n🎉 Seed de servicios ejecutado exitosamente!');

  } catch (error) {
    console.error('❌ Error ejecutando seed de servicios:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  seedServices()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedServices };