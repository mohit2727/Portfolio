import React from "react";
import aboutImage from "../assets/about.jpg"; // Replace with your image

const About = () => {
  return (
    <section className="min-h-screen flex flex-col md:flex-row items-center justify-center px-8 md:px-16 py-16 gap-10 bg-orange-100 text-gray-800">
      {/* Image Section */}
      <div className="md:w-1/2">
        <img
          src={aboutImage}
          alt="About Me"
          className="rounded-xl shadow-lg w-full max-w-md mx-auto"
        />
      </div>

      {/* Text Section */}
      <div className="md:w-1/2 text-center md:text-left">
        <h2 className="text-3xl font-bold mb-4 text-red-500">About Me</h2>
        <p className="text-lg text-gray-700 mb-4">
          Hello! I'm <span className="font-semibold">Mohit Acharya</span>, a
          passionate web developer and tech enthusiast. With over 5 years of
          experience, I specialize in creating beautiful, fast, and functional
          websites using the latest technologies.
        </p>
        <p className="text-gray-600 mb-6">
          My focus is on building meaningful digital experiences, and I enjoy
          working on both frontend and backend technologies including React,
          Node.js, MongoDB, and Tailwind CSS. I’m also exploring AI-driven web
          applications and love building tools that solve real-world problems.
        </p>
        <div className="flex flex-wrap gap-4 justify-center md:justify-start">
          <span className="bg-red-100 text-red-600 px-4 py-2 rounded-full text-sm">
            Web Development
          </span>
          <span className="bg-blue-100 text-blue-600 px-4 py-2 rounded-full text-sm">
            UI/UX Design
          </span>
          <span className="bg-green-100 text-green-600 px-4 py-2 rounded-full text-sm">
            React & Tailwind
          </span>
          <span className="bg-purple-100 text-purple-600 px-4 py-2 rounded-full text-sm">
            AI Integration
          </span>
        </div>
      </div>
    </section>
  );
};

export default About;
