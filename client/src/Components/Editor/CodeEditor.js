import React, { useState, useEffect, useRef } from "react";
import { Editor } from "@monaco-editor/react";
import axios from "axios";
import { io } from "socket.io-client";
import { useNavigate, useParams } from "react-router-dom";
import { useUser } from '../../Contexts/UserContext';
const CodeEditor = () => {
  const navigate = useNavigate();
  const { contestId, teamId } = useParams(); // Extract the teamId from the URL
  const { user } = useUser(); // Get user data from context
  const [code, setCode] = useState("// Write your code here...");
  const [language, setLanguage] = useState("javascript");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const [customInput, setCustomInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [teamScore, setTeamScore] = useState(0); // Team's score state
  const socket = useRef(null); // Use useRef for the socket connection

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const tasksPerPage = 1;


  // Persistent data - load from localStorage
  useEffect(() => {
    const savedCode = localStorage.getItem("savedCode");
    const savedScore = localStorage.getItem("teamScore");

    if (savedCode) setCode(savedCode);
    if (savedScore) setTeamScore(Number(savedScore));

    const dummyTasks = [
      {
        title: "Reverse a String",
        statement: "Write a function to reverse a given string.",
        explanation: "You need to take a string as input and return its reverse.",
        testcases: [
          { input: "hello", output: "olleh" },
          { input: '"world"', output: '"dlrow"' },
          { input: "coding", output: "gnidoc" },
        ],
      },
      {
        title: "Sum of Two Numbers",
        statement: "Write a function to return the sum of two numbers.",
        explanation: "You need to take two integers as input and return their sum.",
        testcases: [
          { input: "2 3", output: "5" },
          { input: "-1 4", output: "3" },
          { input: "10 15", output: "25" },
        ],
      },
    ];
    setTasks(dummyTasks);
    socket.current = io("http://localhost:5000");

  // Emit event to join the team room
    socket.current.emit("joinRoom", teamId);

  // Listen for incoming messages
    socket.current.on("message", (message) => {
    setMessages((prevMessages) => [...prevMessages, message]);
  });

  // Cleanup on component unmount
  return () => {
    socket.current.disconnect(); // Disconnect the socket when component is unmounted
  };
  }, [teamId]);

  const handleEditorChange = (value) => {
    setCode(value);
    // Save the code to localStorage when it changes
    localStorage.setItem("savedCode", value);
  };

  const getLanguageId = (language) => {
    const languages = { javascript: 63, python: 71, java: 62 };
    return languages[language] || 63; // Default to JavaScript
  };

  const runCode = () => {
    try {
      const userFunction = new Function("input", code);
      const result = userFunction(customInput || tasks[currentPage]?.testcases[0]?.input);
      setOutput(`Output: ${result}`);
    } catch (err) {
      setOutput(`Error: ${err.message}`);
    }
  };

  const submitCode = async () => {
    setLoading(true);
    setTestResults([]); // Clear previous results

    try {
      const selectedTask = tasks[currentPage];
      const testcases = selectedTask.testcases;

      const results = await Promise.all(
        testcases.map(async (testcase) => {
          const response = await axios.post(
            "https://judge0-ce.p.rapidapi.com/submissions",
            {
              source_code: code,
              language_id: getLanguageId(language),
              stdin: testcase.input.trim(),
              expected_output: testcase.output.trim(),
            },
            {
              headers: {
                "Content-Type": "application/json",
                "X-RapidAPI-Key": "a6098a2ae7msh19a639cb152ab1cp1b8b4fjsnd5d51f5d6524",
                "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
              },
            }
          );

          const token = response.data.token;

          const resultResponse = await axios.get(
            `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
            {
              headers: {
                "X-RapidAPI-Key": "a6098a2ae7msh19a639cb152ab1cp1b8b4fjsnd5d51f5d6524",
                "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
              },
            }
          );

          const result = resultResponse.data;
          const status = result.status.id === 3 ? "Passed" : "Failed";
          const actualOutput = result.stdout?.trim() || "Error/No Output";

          return {
            input: testcase.input,
            expected: testcase.output,
            actual: actualOutput,
            status,
          };
        })
      );

      setTestResults(results);

      const passed = results.filter((result) => result.status === "Passed").length;
      const scoreForThisTask = (passed / testcases.length) * 50;

      setTeamScore((prevScore) => prevScore + scoreForThisTask);

      localStorage.setItem("teamScore", teamScore + scoreForThisTask);

      setOutput(`${passed}/${testcases.length} test cases passed. You earned ${scoreForThisTask} points.`);
    } catch (error) {
      setOutput(`Error during evaluation: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // const sendMessage = () => {
  //   if (currentMessage.trim()) {
  //     const message = { teamId, content: currentMessage, sender: "You" };
  //     socket.current.emit("message", message);
  //     setMessages((prevMessages) => [...prevMessages, message]);
  //     setCurrentMessage("");
  //   }
  // };
  const sendMessage = () => {
      const message = { teamId, content: currentMessage, sender: user.username };
      socket.current.emit("message", message); // Emit to the server
      setMessages((prevMessages) => [...prevMessages, message]); // Update local message list
      setCurrentMessage(""); 
      console.log(messages)// Clear the input
    
  };
  

  const handlePagination = (direction) => {
    if (direction === "prev" && currentPage > 0) {
      setCurrentPage(currentPage - 1);
    } else if (direction === "next" && currentPage < tasks.length - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const finish = async () => {
    try {
      const score = calculateScore(); 
      console.log(score);
      const response = await axios.put(`http://localhost:5000/api/contest/team/${teamId}/score`, { score });

      if (response.status === 200) {
        console.log("Team score updated successfully");
        navigate(`/contest/${contestId}/result/${teamId}`);
      } else {
        console.error("Failed to update score");
      }
    } catch (error) {
      console.error("Error updating team score:", error);
    }
  };

  const calculateScore = () => {
    return 10;
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-4  bg-gray-100 border-b">
        <h1 className="text-xl font-semibold">Code Battle 2024</h1>  

        {/* Pagination */}
        <div className="p-4  flex justify-center gap-10 items-center">
          <div className="text-lg">Score: {teamScore}</div>
          <button
            onClick={() => handlePagination("prev")}
            className="px-4 py-2 mx-2 bg-gray-400 text-white rounded-md hover:bg-gray-500"
            disabled={currentPage === 0}
          >
            Previous
          </button>
          <span className="px-4 py-2">{`Task ${currentPage + 1} of ${tasks.length}`}</span>
          <button
            onClick={() => handlePagination("next")}
            className="px-4 py-2 mx-2 bg-gray-400 text-white rounded-md hover:bg-gray-500"
            disabled={currentPage === tasks.length - 1}
          >
            Next
          </button>
        </div>

        {/* Finish Button */}
        <div className="p-4  flex justify-center gap-10">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="p-2 border rounded"
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
          </select>
          <button
            onClick={finish}
            className="px-6 py-3 bg-blue-500 text-white rounded-md"
          >
            Finish
          </button>
        </div>
      </div>

      {/* Code Editor */}
      <div className="flex-1 flex justify-center  bg-gray-200 w-full ">
        {/* Test Cases */}
        <div className="flex flex-col gap-4 justify-between  p-4 w-2/5 border-r-2 border-gray-400 ">
        <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{tasks[currentPage]?.title}</h2>
        <p>{tasks[currentPage]?.statement}</p>
        <p>{tasks[currentPage]?.explanation}</p>
        
        </div>
        

        <div className="p-4 flex gap-2 justify-between">
          <button
            onClick={runCode}
            disabled={loading}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
          >
            Run Code
          </button>
          <button
            onClick={submitCode}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Submit Code
          </button>
        </div>
        </div>
        <div className="w-full max-w-3/5 py-2 px-1 ">
          <Editor
            height="500px"
            defaultLanguage="javascript"
            value={code}
            onChange={handleEditorChange}
          />
        </div>
      </div>

      {/* Output */}
      <div className="bg-gray-100 px-4  py-2 flex justify-between">
        <div><h2 className="text-xl font-semibold">Test Output</h2>
        <pre>{output}</pre>
        </div>
        {/* Chat */}
        <div className="flex flex-col gap-1 p-2 w-2/5 bg-violet-100 rounded-xl border-l-2 border-violet-100">
        <h2 className="text-xl font-semibold">Team Bashes</h2>
  <div className="flex flex-col bg-gray-200 p-4 h-52 overflow-auto">
    {/* Filter out messages sent by "You" */}
    {messages.map((msg, index) => (
          <div key={index} className="message">
            <strong>{msg.sender}:</strong> <p>{msg.content}</p>
          </div>
        ))}

  </div>

  <div className="flex gap-2">
    <input
      type="text"
      value={currentMessage}
      onChange={(e) => setCurrentMessage(e.target.value)}
      className="px-4 py-2 w-full border rounded-md"
    />
    <button
      onClick={sendMessage}
      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
         Send
        </button>
        </div>
      </div>


      </div>

      

      
    </div>
  );
};

export default CodeEditor;