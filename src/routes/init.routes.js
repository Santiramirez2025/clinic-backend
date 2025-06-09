// src/routes/init.routes.js - Endpoint para inicializar DB sin Shell
import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

// 🔧 Endpoint para inicializar la base de datos
router.post('/setup-database', async (req, res) => {
  try {
    logger.info('🔧 Starting database setup...');
    
    // 1. Verificar conexión
    await prisma.$connect();
    logger.info('✅ Database connected');
    
    // 2. Crear usuario demo si no existe
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    const demoUser = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {
        password: hashedPassword,
        isActive: true,
        isVIP: true,
        vipExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      create: {
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Demo User',
        phone: '+54 11 1234-5678',
        role: 'CLIENTE',
        isVIP: true,
        vipExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        location: 'Buenos Aires, Argentina'
      }
    });
    
    logger.info('✅ Demo user created/updated');
    
    // 3. Crear clínica demo si no existe
    const demoClinic = await prisma.clinic.upsert({
      where: { email: 'info@clinicapremium.com' },
      update: {},
      create: {
        name: 'Clínica Estética Premium',
        description: 'Centro de belleza y estética integral',
        address: 'Av. Santa Fe 1234, CABA',
        phone: '+54 11 4567-8900',
        email: 'info@clinicapremium.com',
        primaryColor: '#6366f1',
        secondaryColor: '#8b5cf6'
      }
    });
    
    logger.info('✅ Demo clinic created/updated');
    
    // 4. Crear servicios demo
    const services = [
      {
        name: 'Limpieza Facial',
        description: 'Limpieza profunda con extracción',
        duration: 60,
        price: 8500,
        category: 'Facial',
        vipDiscount: 20,
        clinicId: demoClinic.id
      },
      {
        name: 'Botox',
        description: 'Tratamiento antiedad',
        duration: 30,
        price: 25000,
        category: 'Antienvejecimiento',
        vipDiscount: 25,
        clinicId: demoClinic.id
      }
    ];
    
    for (const serviceData of services) {
      await prisma.service.upsert({
        where: { 
          name_clinicId: {
            name: serviceData.name,
            clinicId: demoClinic.id
          }
        },
        update: serviceData,
        create: serviceData
      });
    }
    
    logger.info('✅ Demo services created/updated');
    
    // 5. Crear suscripción VIP
    await prisma.vipSubscription.upsert({
      where: { 
        userId: demoUser.id
      },
      update: {
        status: 'ACTIVE',
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      create: {
        userId: demoUser.id,
        status: 'ACTIVE',
        planType: 'annual',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        price: 12000,
        discount: 33
      }
    });
    
    logger.info('✅ VIP subscription created/updated');
    
    res.json({
      success: true,
      message: 'Database setup completed successfully',
      data: {
        demoUser: {
          email: demoUser.email,
          name: demoUser.name,
          isVIP: demoUser.isVIP
        },
        clinic: {
          name: demoClinic.name
        },
        servicesCount: services.length
      }
    });
    
  } catch (error) {
    logger.error('❌ Database setup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Database setup failed',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
});

// 🔍 Endpoint para verificar estado de la DB
router.get('/database-status', async (req, res) => {
  try {
    const [userCount, clinicCount, serviceCount] = await Promise.all([
      prisma.user.count(),
      prisma.clinic.count(),
      prisma.service.count()
    ]);
    
    const demoUser = await prisma.user.findUnique({
      where: { email: 'test@example.com' }
    });
    
    res.json({
      success: true,
      data: {
        database: 'connected',
        tables: {
          users: userCount,
          clinics: clinicCount,
          services: serviceCount
        },
        demoUserExists: !!demoUser,
        demoUser: demoUser ? {
          email: demoUser.email,
          name: demoUser.name,
          isVIP: demoUser.isVIP
        } : null
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Database connection failed',
      details: error.message
    });
  }
});

export default router;