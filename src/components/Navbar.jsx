// src/components/Navbar.jsx
// src/components/Navbar.jsx
import React from "react";
import { Link as ScrollLink } from "react-scroll";
import logo from "../assets/logo.png";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-orange-100 backdrop-blur-md shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <img 
            src={logo}
            alt="logo" 
            className="h-16 w-20 border-1 rounded-full"
          />

          <div className="hidden md:flex space-x-8">
            <ScrollLink
              to="home"
              smooth={true}
              duration={500}
              offset={-80}
              className="cursor-pointer text-black hover:text-black-300 transition p-2 bg-white border rounded-xl hover:scale-105 transition-transform duration-300"
            >
              Home
            </ScrollLink>

            <ScrollLink
              to="about"
              smooth={true}
              duration={500}
              offset={-80}
              className="cursor-pointer text-black hover:text-black-300 transition p-2 bg-white border rounded-xl hover:scale-105 transition-transform duration-300"
            >
              About
            </ScrollLink>

            <ScrollLink
              to="services"
              smooth={true}
              duration={500}
              offset={-80}
              className="cursor-pointer text-black hover:text-black-300 transition p-2 bg-white border rounded-xl hover:scale-105 transition-transform duration-300"
            >
              Services
            </ScrollLink>

            <ScrollLink
              to="projects"
              smooth={true}
              duration={500}
              offset={-80}
              className="cursor-pointer text-black hover:text-black-300 transition p-2 bg-white border rounded-xl hover:scale-105 transition-transform duration-300"
            >
              Projects
            </ScrollLink>

            <ScrollLink
              to="contact"
              smooth={true}
              duration={500}
              offset={-80}
              className="cursor-pointer text-black hover:text-black-300 transition p-2 bg-white border rounded-xl hover:scale-105 transition-transform duration-300"
            >
              Contact
            </ScrollLink>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;



