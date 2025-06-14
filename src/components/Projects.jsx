import React from "react";
import project1 from "../assets/project1.jpg"; // Replace with your actual image path
import urlshortner from "../assets/shortner.jpg";
import caption from "../assets/caption.png";

const projects = [
  {
    id: 1,
    title: "Portfolio Website",
    description: "A personal portfolio built with React and Tailwind CSS to showcase my skills and projects.",
    image: project1, // Replace with your actual image path
    demoLink: "https://your-portfolio-link.com",
    codeLink: "https://github.com/yourusername/portfolio"
  },
  {
    id: 2,
    title: "AI Caption Generator",
    description: "A full-stack app that generates captions from text using OpenAI API and stores user history.",
    image: caption,
    demoLink: "https://your-ai-app-link.com",
    codeLink: "https://github.com/yourusername/ai-image-gen"
  },
  {
    id: 3,
    title: "Url Shortner",
    description: "Tool that converts large urls into short urls using Node.js and MongoDB.",
    image: urlshortner,
    demoLink: "https://shortgen.com",
    codeLink: "https://github.com/yourusername/blog-to-shorts"
  },
  // Add more projects as needed
];

const Projects = () => {
  return (
    <section id="projects" className="bg-orange-100 py-16 px-6 md:px-16">
      <h2 className="text-4xl font-bold text-center text-red-500 mb-12">Projects</h2>
      <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
        {projects.map(({ id, title, description, image, demoLink, codeLink }) => (
          <div key={id} className="bg-white shadow-lg rounded-xl overflow-hidden hover:shadow-2xl transition-shadow duration-300">
            <img src={image} alt={title} className="w-full h-48 object-cover" />
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">{title}</h3>
              <p className="text-gray-600 mb-4">{description}</p>
              <div className="flex justify-between">
                <a href={demoLink} target="_blank" rel="noopener noreferrer" className="text-red-500 font-medium hover:underline">
                  Live Demo
                </a>
                <a href={codeLink} target="_blank" rel="noopener noreferrer" className="text-gray-700 font-medium hover:underline">
                  Code
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Projects;
