import React from "react";
import contact from "../assets/contact.jpg"; // Ensure you have a profile image at this path

const Contact = () => {
  const onSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);

    formData.append("access_key", "b34a76fd-4e6f-4335-8fd7-58eabf944c5f"); // Replace with your Web3Forms access key

    const object = Object.fromEntries(formData);
    const json = JSON.stringify(object);

    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: json
    }).then((res) => res.json());

    if (res.success) {
      alert("Message sent successfully!");
      event.target.reset(); // Reset form fields
    } else {
      alert("Something went wrong. Please try again.");
    }
  };

  return (
    <section className="flex min-h-screen bg-orange-100 px-8 md:px-16 py-16">
      <div className="max-w-2xl mx-auto bg-white shadow-md rounded-xl p-8">
        <h2 className="text-3xl font-bold text-center text-red-500 mb-6">Contact Me</h2>

        <form onSubmit={onSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              name="name"
              required
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="Your Name"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="you@example.com"
            />
          </div>

          {/* Message */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              name="message"
              required
              rows="5"
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="Write your message here..."
            ></textarea>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-red-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-600 transition duration-200"
          >
            Send Message
          </button>
        </form>
      </div>
      <div className="md:w-1/3 flex justify-center ">
        <img src={contact} 
        alt="contact img"
        className=" w-full rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-400" />
      </div>
    </section>
  );
};

export default Contact;
