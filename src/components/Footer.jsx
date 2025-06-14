import React from "react";

const Footer = () => {
  return (
    <footer className="bg-orange-100 text-gray-800 py-8 mt-10">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Branding */}
        <h1 className="text-xl font-bold text-gray-800">© {new Date().getFullYear()} Mohit Acharya</h1>

        {/* Social Icons */}
        <div className="flex space-x-4">
          <a href="https://github.com/yourusername" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            <i className="fab fa-github text-2xl">Github</i>
          </a>
          <a href="https://linkedin.com/in/yourusername" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            <i className="fab fa-linkedin text-2xl">LinkedIn</i>
          </a>
          <a href="mailto:your@email.com" className="hover:text-white">
            <i className="fas fa-envelope text-2xl">Email</i>
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
