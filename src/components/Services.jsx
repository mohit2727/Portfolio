import React from "react";
import { Code, Paintbrush, Smartphone } from "lucide-react"; // Optional: lucide icons

const services = [
  {
    title: "Web Development",
    description:
      "I build fast, responsive, and accessible websites using modern frameworks like React, Node.js, and Tailwind CSS.",
    icon: <Code className="w-8 h-8 text-red-500" />,
  },
  {
    title: "UI/UX Design",
    description:
      "Designing beautiful, user-friendly interfaces that provide a seamless user experience across all devices.",
    icon: <Paintbrush className="w-8 h-8 text-blue-500" />,
  },
  {
    title: "Mobile Responsive",
    description:
      "Creating designs that work perfectly on all screen sizes, ensuring your site looks amazing on any device.",
    icon: <Smartphone className="w-8 h-8 text-green-500" />,
  },
];

const Services = () => {
  return (
    <section className="min-h-screen px-8 md:px-16 py-16 bg-orange-100 text-gray-800">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-red-500 mb-4">My Services</h2>
        <p className="text-gray-600 max-w-2xl mx-auto">
          I offer a range of development and design services to help bring your digital vision to life.
        </p>
      </div>

      <div className="grid gap-10 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service, index) => (
          <div
            key={index}
            className="bg-gray-50 shadow-md p-6 rounded-xl hover:shadow-lg transition-all duration-300"
          >
            <div className="mb-4">{service.icon}</div>
            <h3 className="text-xl font-semibold mb-2">{service.title}</h3>
            <p className="text-gray-600">{service.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Services;
