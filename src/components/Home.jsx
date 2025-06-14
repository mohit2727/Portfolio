import React from "react";
import bg from "../assets/bg.jpg";
import profile from "../assets/profile.jpg";
import { Link as ScrollLink } from "react-scroll";

const Home = () => {
  return (
    <section className="flex flex-col-reverse md:flex-row items-center justify-center px-10 md:px-16 py-25 gap-5">
      {/* Background Image */}
      <div className="absolute inset-0 z-[-1] bg-black opacity-80 ">
        <img
          src={bg}
          alt="Background"
          className="w-full h-full object-cover opacity-50" />
      </div>
      {/* Text content */}
      <div className="md:w-1/2 text-center md:text-left">
        <p className="text-white text-lg font-semibold mb-2">HELLO!</p>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">I Am Mohit Acharya</h1>
        <p className="text-gray-300 mb-6">
          I'm a Web Developer with extensive experience for over 5 years. My expertise is
          to create and Website design, graphic design and many more.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">

          <ScrollLink
            to="projects"
            smooth={true}
            duration={500}
            offset={-80}
            className="cursor-pointer text-black hover:text-black-300 transition rounded-xl hover:scale-105 transition-transform duration-300"
          >
            <button className="bg-red-500 text-white px-6 py-2 rounded-full hover:bg-red-600">View Work</button>
          </ScrollLink>



          <ScrollLink
            to="contact"
            smooth={true}
            duration={500}
            offset={-80}
            className="cursor-pointer text-black hover:text-black-300 transition rounded-xl hover:scale-105 transition-transform duration-300"
          >
            <button className="bg-pink-500 text-white px-6 py-2 rounded-full hover:bg-pink-600">Hire Me</button>
          </ScrollLink>

        </div>
      </div>

      {/* Image */}
      <div className="md:w-1/2 flex justify-center ">
        <img
          src={profile}
          alt="Mohit's Profile"
          className="rounded-full w-full max-w-md md:max-w-lg mx-auto shadow-lg hover:scale-105 transition-transform duration-300"
        />
      </div>

    </section>
  );
};

export default Home;
