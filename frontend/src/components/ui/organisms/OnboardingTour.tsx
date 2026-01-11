'use client';

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { completeOnboarding } from '@/app/dashboard/actions';

interface Props {
    startTour: boolean;
}

export default function OnboardingTour({ startTour }: Props) {
    const driverObj = useRef<ReturnType<typeof driver>>(null);

    useEffect(() => {
        if (!startTour) return;

        // Give UI a moment to render
        const timer = setTimeout(() => {
            driverObj.current = driver({
                showProgress: true,
                animate: true,
                allowClose: true,
                doneBtnText: '¡Listo, a empezar!',
                nextBtnText: 'Siguiente',
                prevBtnText: 'Atrás',
                progressText: 'Paso {{current}} de {{total}}',
                steps: [
                    {
                        element: '#tour-welcome',
                        popover: {
                            title: '👋 ¡Bienvenido a NiddoFlow!',
                            description: 'Tu centro de comando financiero. Aquí tienes un resumen rápido de tu salud financiera familiar.',
                            side: 'bottom',
                            align: 'start'
                        }
                    },
                    {
                        element: '#tour-balance',
                        popover: {
                            title: '💰 Balance Total',
                            description: 'Este es el dinero real disponible en todas tus cuentas (Bancos + Efectivo).',
                            side: 'bottom',
                            align: 'start'
                        }
                    },
                    {
                        element: '#tour-income',
                        popover: {
                            title: '📈 Ingresos del Mes',
                            description: 'Todo el dinero que ha entrado a la familia este mes.',
                            side: 'bottom'
                        }
                    },
                    {
                        element: '#tour-new-tx',
                        popover: {
                            title: '➕ Registrar Transacción',
                            description: 'El botón más importante. Úsalo para registrar cada gasto o ingreso rápidamente.',
                            side: 'left',
                            align: 'center'
                        }
                    },
                    {
                        element: '#tour-smartfeed',
                        popover: {
                            title: '🧠 Smart Feed',
                            description: 'Aquí verás alertas inteligentes: presupuestos agotados, deudas por vencer y consejos de ahorro.',
                            side: 'right',
                            align: 'start'
                        }
                    },
                    {
                        element: '#tour-reports',
                        popover: {
                            title: '📄 Reportes y Análisis',
                            description: 'Accede a gráficos detallados y descarga tu historial completo desde aquí.',
                            side: 'bottom',
                            align: 'end'
                        }
                    }
                ],
                onDestroyStarted: () => {
                    if (driverObj.current?.hasNextStep() || driverObj.current?.isLastStep()) {
                        driverObj.current?.destroy();
                        completeOnboarding();
                    }
                },
            });

            driverObj.current.drive();
        }, 1500); // Small delay to ensure animations finish

        return () => clearTimeout(timer);
    }, [startTour]);

    return null; // Logic only
}
