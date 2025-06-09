// src/scripts/seed.js - Script para poblar la base de datos con datos iniciales
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

const seedData = async () => {
  try {
    logger.info('🌱 Iniciando seed de datos...');

    // Limpiar datos existentes en orden correcto
    await prisma.notification.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.vipSubscription.deleteMany();
    await prisma.tip.deleteMany();
    await prisma.service.deleteMany();
    await prisma.user.deleteMany();
    await prisma.clinic.deleteMany();
    await prisma.appConfig.deleteMany();
    await prisma.systemLog.deleteMany();

    logger.info('🗑️ Datos existentes eliminados');

    // Crear clínicas
    const clinic1 = await prisma.clinic.create({
      data: {
        name: 'Clínica Estética Premium',
        description: 'Centro de belleza y estética integral con tecnología de vanguardia',
        address: 'Av. Santa Fe 1234, CABA, Buenos Aires',
        phone: '+54 11 4567-8900',
        email: 'info@clinicapremium.com',
        website: 'https://clinicapremium.com',
        primaryColor: '#6366f1',
        secondaryColor: '#8b5cf6',
        openTime: '09:00',
        closeTime: '19:00',
        workingDays: '1,2,3,4,5,6' // Lunes a sábado
      }
    });

    const clinic2 = await prisma.clinic.create({
      data: {
        name: 'Bella Vita Spa',
        description: 'Spa de relajación y tratamientos de belleza natural',
        address: 'Av. Alvear 567, Recoleta, CABA',
        phone: '+54 11 5678-9012',
        email: 'contacto@bellavita.com',
        primaryColor: '#10b981',
        secondaryColor: '#06b6d4',
        openTime: '10:00',
        closeTime: '20:00',
        workingDays: '1,2,3,4,5,6,7' // Todos los días
      }
    });

    logger.info('🏢 Clínicas creadas');

    // Crear usuarios administradores
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const hashedUserPassword = await bcrypt.hash('password123', 12);

    const admin1 = await prisma.user.create({
      data: {
        email: 'admin@clinicapremium.com',
        password: hashedPassword,
        name: 'Carlos Administrador',
        phone: '+54 11 1234-5678',
        role: 'ADMIN',
        clinicId: clinic1.id,
        location: 'Buenos Aires, Argentina'
      }
    });

    const admin2 = await prisma.user.create({
      data: {
        email: 'admin@bellavita.com',
        password: hashedPassword,
        name: 'Ana Directora',
        phone: '+54 11 2345-6789',
        role: 'ADMIN',
        clinicId: clinic2.id,
        location: 'Buenos Aires, Argentina'
      }
    });

    // Crear staff
    const staff1 = await prisma.user.create({
      data: {
        email: 'staff@clinicapremium.com',
        password: hashedPassword,
        name: 'Dr. Miguel Silva',
        phone: '+54 11 3456-7890',
        role: 'STAFF',
        clinicId: clinic1.id,
        bio: 'Especialista en dermatología estética con 10 años de experiencia',
        location: 'Buenos Aires, Argentina'
      }
    });

    // Crear usuarios demo
    const demoUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        password: hashedUserPassword,
        name: 'María González',
        phone: '+54 11 4567-8901',
        role: 'CLIENTE',
        clinicId: clinic1.id,
        bio: 'Apasionada por el cuidado de la piel y los tratamientos naturales',
        birthday: new Date('1990-05-15'),
        location: 'Buenos Aires, Argentina',
        isVIP: true,
        vipExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 año
      }
    });

    const user2 = await prisma.user.create({
      data: {
        email: 'sofia@example.com',
        password: hashedUserPassword,
        name: 'Sofía Rodriguez',
        phone: '+54 11 5678-9012',
        role: 'CLIENTE',
        clinicId: clinic1.id,
        bio: 'Modelo y influencer enfocada en belleza y bienestar',
        birthday: new Date('1995-08-22'),
        location: 'Buenos Aires, Argentina'
      }
    });

    const user3 = await prisma.user.create({
      data: {
        email: 'laura@example.com',
        password: hashedUserPassword,
        name: 'Laura Martínez',
        phone: '+54 11 6789-0123',
        role: 'CLIENTE',
        clinicId: clinic2.id,
        birthday: new Date('1988-12-03'),
        location: 'Buenos Aires, Argentina'
      }
    });

    logger.info('👥 Usuarios creados');

    // Crear servicios para Clínica Premium
    const services1 = await Promise.all([
      prisma.service.create({
        data: {
          name: 'Limpieza Facial Profunda',
          description: 'Limpieza completa con extracción de puntos negros y hidratación',
          duration: 60,
          price: 8500,
          category: 'Facial',
          vipDiscount: 20,
          clinicId: clinic1.id
        }
      }),
      prisma.service.create({
        data: {
          name: 'Tratamiento Anti-edad',
          description: 'Rejuvenecimiento facial con ácido hialurónico y radiofrecuencia',
          duration: 90,
          price: 15000,
          category: 'Anti-edad',
          vipDiscount: 25,
          clinicId: clinic1.id
        }
      }),
      prisma.service.create({
        data: {
          name: 'Depilación Láser',
          description: 'Depilación permanente con láser de diodo',
          duration: 45,
          price: 12000,
          category: 'Depilación',
          vipDiscount: 15,
          clinicId: clinic1.id
        }
      }),
      prisma.service.create({
        data: {
          name: 'Peeling Químico',
          description: 'Renovación celular con ácidos para mejorar textura de la piel',
          duration: 75,
          price: 18000,
          category: 'Tratamientos',
          vipDiscount: 30,
          clinicId: clinic1.id
        }
      }),
      prisma.service.create({
        data: {
          name: 'Consulta Dermatológica VIP',
          description: 'Evaluación completa con dermatólogo especialista',
          duration: 30,
          price: 6000,
          category: 'Consulta',
          isVipOnly: true,
          vipDiscount: 50,
          clinicId: clinic1.id
        }
      }),
      prisma.service.create({
        data: {
          name: 'Masaje Relajante',
          description: 'Masaje corporal completo para relajación y bienestar',
          duration: 60,
          price: 7500,
          category: 'Relajación',
          vipDiscount: 20,
          clinicId: clinic1.id
        }
      })
    ]);

    // Crear servicios para Bella Vita Spa
    const services2 = await Promise.all([
      prisma.service.create({
        data: {
          name: 'Ritual de Relajación',
          description: 'Experiencia completa de spa con aromaterapia',
          duration: 120,
          price: 20000,
          category: 'Spa',
          vipDiscount: 25,
          clinicId: clinic2.id
        }
      }),
      prisma.service.create({
        data: {
          name: 'Facial Hidratante',
          description: 'Tratamiento facial con productos naturales',
          duration: 60,
          price: 9000,
          category: 'Facial',
          vipDiscount: 20,
          clinicId: clinic2.id
        }
      }),
      prisma.service.create({
        data: {
          name: 'Exfoliación Corporal',
          description: 'Renovación de la piel con productos orgánicos',
          duration: 45,
          price: 8000,
          category: 'Corporal',
          vipDiscount: 15,
          clinicId: clinic2.id
        }
      })
    ]);

    logger.info('💆‍♀️ Servicios creados');

    // Crear suscripción VIP para el usuario demo
    const vipSubscription = await prisma.vipSubscription.create({
      data: {
        userId: demoUser.id,
        status: 'ACTIVE',
        planType: 'annual',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
        price: 12000,
        discount: 33
      }
    });

    logger.info('⭐ Suscripción VIP creada');

    // Crear citas de ejemplo
    const appointments = await Promise.all([
      // Cita próxima para demo user
      prisma.appointment.create({
        data: {
          date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // En 2 días
          time: '14:30',
          userId: demoUser.id,
          serviceId: services1[0].id, // Limpieza facial
          clinicId: clinic1.id,
          status: 'CONFIRMED',
          originalPrice: 8500,
          finalPrice: 6800, // Con descuento VIP
          vipDiscount: 20,
          notes: 'Primera vez en tratamiento VIP'
        }
      }),
      // Cita completada
      prisma.appointment.create({
        data: {
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Hace 1 semana
          time: '16:00',
          userId: demoUser.id,
          serviceId: services1[1].id, // Anti-edad
          clinicId: clinic1.id,
          status: 'COMPLETED',
          originalPrice: 15000,
          finalPrice: 11250, // Con descuento VIP
          vipDiscount: 25,
          notes: 'Tratamiento completado exitosamente'
        }
      }),
      // Cita para otro usuario
      prisma.appointment.create({
        data: {
          date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // En 5 días
          time: '10:00',
          userId: user2.id,
          serviceId: services1[2].id, // Depilación láser
          clinicId: clinic1.id,
          status: 'SCHEDULED',
          originalPrice: 12000,
          finalPrice: 12000,
          vipDiscount: 0
        }
      }),
      // Cita en otra clínica
      prisma.appointment.create({
        data: {
          date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // En 3 días
          time: '15:00',
          userId: user3.id,
          serviceId: services2[0].id, // Ritual de relajación
          clinicId: clinic2.id,
          status: 'CONFIRMED',
          originalPrice: 20000,
          finalPrice: 20000,
          vipDiscount: 0
        }
      })
    ]);

    logger.info('📅 Citas creadas');

    // Crear tips
    const tips = await Promise.all([
      prisma.tip.create({
        data: {
          title: 'Hidratación diaria',
          content: 'Aplica crema hidratante mañana y noche para mantener tu piel saludable. Usa protector solar todos los días, incluso en días nublados.',
          category: 'Cuidado facial',
          clinicId: clinic1.id
        }
      }),
      prisma.tip.create({
        data: {
          title: 'Preparación pre-tratamiento',
          content: 'Evita la exposición solar 48 horas antes de tu cita. Mantén tu piel limpia y sin maquillaje.',
          category: 'Preparación',
          clinicId: clinic1.id
        }
      }),
      prisma.tip.create({
        data: {
          title: 'Beneficios VIP exclusivos',
          content: 'Como miembro VIP, accedes a descuentos especiales y consultas gratuitas. ¡Aprovecha al máximo tu membresía!',
          category: 'VIP',
          isVipOnly: true,
          clinicId: clinic1.id
        }
      }),
      prisma.tip.create({
        data: {
          title: 'Relajación en casa',
          content: 'Practica técnicas de respiración profunda y meditación para complementar tus tratamientos de spa.',
          category: 'Bienestar',
          clinicId: clinic2.id
        }
      })
    ]);

    logger.info('💡 Tips creados');

    // Crear notificaciones de ejemplo
    const notifications = await Promise.all([
      prisma.notification.create({
        data: {
          title: '🎉 ¡Bienvenida VIP!',
          message: 'Tu suscripción VIP está activa. Disfruta de descuentos exclusivos y prioridad en reservas.',
          type: 'VIP_PROMOTION',
          userId: demoUser.id,
          clinicId: clinic1.id,
          sentEmail: true,
          sentPush: true
        }
      }),
      prisma.notification.create({
        data: {
          title: '📅 Cita confirmada',
          message: 'Tu cita de Limpieza Facial ha sido confirmada para mañana a las 14:30.',
          type: 'APPOINTMENT_CONFIRMATION',
          userId: demoUser.id,
          clinicId: clinic1.id,
          appointmentId: appointments[0].id,
          sentEmail: true,
          sentSms: false,
          sentPush: true
        }
      }),
      prisma.notification.create({
        data: {
          title: '💆‍♀️ Tratamiento completado',
          message: 'Tu sesión de tratamiento anti-edad ha sido completada exitosamente.',
          type: 'GENERAL',
          userId: demoUser.id,
          clinicId: clinic1.id,
          appointmentId: appointments[1].id,
          isRead: true,
          readAt: new Date(),
          sentEmail: true,
          sentPush: true
        }
      })
    ]);

    logger.info('🔔 Notificaciones creadas');

    // Crear configuraciones de app
    const appConfigs = await Promise.all([
      prisma.appConfig.create({
        data: {
          key: 'VIP_MONTHLY_PRICE',
          value: '1500',
          description: 'Precio mensual de suscripción VIP en pesos argentinos'
        }
      }),
      prisma.appConfig.create({
        data: {
          key: 'VIP_ANNUAL_PRICE',
          value: '12000',
          description: 'Precio anual de suscripción VIP en pesos argentinos'
        }
      }),
      prisma.appConfig.create({
        data: {
          key: 'DEFAULT_REMINDER_HOURS',
          value: '24',
          description: 'Horas por defecto para recordatorios de citas'
        }
      }),
      prisma.appConfig.create({
        data: {
          key: 'MAX_APPOINTMENTS_PER_USER',
          value: '5',
          description: 'Máximo número de citas futuras por usuario'
        }
      })
    ]);

    logger.info('⚙️ Configuraciones creadas');

    // Estadísticas finales
    const stats = {
      clinics: await prisma.clinic.count(),
      users: await prisma.user.count(),
      services: await prisma.service.count(),
      appointments: await prisma.appointment.count(),
      vipSubscriptions: await prisma.vipSubscription.count(),
      tips: await prisma.tip.count(),
      notifications: await prisma.notification.count(),
      configs: await prisma.appConfig.count()
    };

    logger.info('📊 Estadísticas finales:', stats);
    logger.info('✅ Seed completado exitosamente');

    // Información para testing
    console.log('\n🔐 Credenciales para testing:');
    console.log('Admin: admin@clinicapremium.com / admin123');
    console.log('Staff: staff@clinicapremium.com / admin123');
    console.log('Demo User: test@example.com / password123 (VIP activo)');
    console.log('User 2: sofia@example.com / password123');
    console.log('User 3: laura@example.com / password123\n');

  } catch (error) {
    logger.error('❌ Error en seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

// Ejecutar seed si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  seedData()
    .then(() => {
      logger.info('🌱 Seed ejecutado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Error ejecutando seed:', error);
      process.exit(1);
    });
}

export default seedData;