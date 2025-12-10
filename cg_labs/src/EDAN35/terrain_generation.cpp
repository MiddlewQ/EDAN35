#include "terrain_generation.hpp"
#include "parametric_shapes.hpp"

#include "config.hpp"
#include "core/Bonobo.h"
#include "core/FPSCamera.h"
#include "core/node.hpp"
#include "core/ShaderProgramManager.hpp"
#include <imgui.h>

#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

#include <array>
#include <clocale>
#include <cstdlib>
#include <stdexcept>



edan35::TerrainGenerator::TerrainGenerator(WindowManager& windowManager) :
	mCamera(0.5f * glm::half_pi<float>(),
		static_cast<float>(config::resolution_x) / static_cast<float>(config::resolution_y),
		0.01f, 1000.0f),
	inputHandler(), mWindowManager(windowManager), window(nullptr)
{
	WindowManager::WindowDatum window_datum{ inputHandler, mCamera, config::resolution_x, config::resolution_y, 0, 0, 0, 0 };

	window = mWindowManager.CreateGLFWWindow("EDAF80: Assignment 2", window_datum, config::msaa_rate);
	if (window == nullptr) {
		throw std::runtime_error("Failed to get a window: aborting!");
	}

	bonobo::init();
}

edan35::TerrainGenerator::~TerrainGenerator()
{
	bonobo::deinit();
}

void
edan35::TerrainGenerator::run()
{

	// Set up the camera
	mCamera.mWorld.SetTranslate(glm::vec3(10.0f, 0.0f, 10.0f));
	mCamera.mWorld.LookAt(glm::vec3(0.0f));
	mCamera.mMouseSensitivity = glm::vec2(0.003f);
	mCamera.mMovementSpeed = glm::vec3(3.0f); // 3 m/s => 10.8 km/h

	// Create the shader programs
	ShaderProgramManager program_manager;
	GLuint fallback_shader = 0u;
	program_manager.CreateAndRegisterProgram("Fallback",
		{ { ShaderType::vertex, "common/fullscreen.vert" },
		  { ShaderType::fragment, "common/fallback.frag" } },
		fallback_shader);
	if (fallback_shader == 0u) {
		LogError("Failed to load fallback shader");
		return;
	}

	GLuint ray_marching_shader = 0u;
	program_manager.CreateAndRegisterProgram("Ray Marching",
		{ { ShaderType::vertex, "EDAN35/ray_marching.vert"},
		  { ShaderType::fragment, "EDAN35/ray_marching.frag"} },
		ray_marching_shader);
	if (ray_marching_shader == 0u)
		LogError("Failed to load ray_marching shader");



	GLuint texcoord_shader = 0u;
	program_manager.CreateAndRegisterProgram("Texcoord",
		{ { ShaderType::vertex, "common/fullscreen.vert" },
		  { ShaderType::fragment, "EDAF80/texcoord.frag" } },
		texcoord_shader);
	if (texcoord_shader == 0u)
		LogError("Failed to load texcoord shader");

	GLuint terrain_shader = 0u;
	program_manager.CreateAndRegisterProgram("Terrian",
		{ { ShaderType::vertex, "EDAN35/terrain.vert" },
		  { ShaderType::fragment, "EDAN35/terrain.frag"} },
		terrain_shader);
	if (terrain_shader == 0u)
		LogError("Failed to load water shader");

	GLuint water_shader = 0u;
	program_manager.CreateAndRegisterProgram("Water coords",
		{ { ShaderType::vertex, "EDAF80/water.vert" },
		  { ShaderType::fragment, "EDAF80/water.frag"} },
		water_shader);
	if (water_shader == 0u)
		LogError("Failed to load water shader");

	glm::vec3 light_position = glm::vec3(0.0f, 30.0f, 0.0f);
	glm::vec3 camera_position = mCamera.mWorld.GetTranslation();
	glm::vec3 camera_front = glm::normalize(mCamera.mWorld.GetFront());
	glm::vec3 camera_right = glm::normalize(mCamera.mWorld.GetRight());
	glm::vec3 camera_up = glm::normalize(mCamera.mWorld.GetUp());
	int octaves = 8;
	float atmosphere_dimming = 0.006f;

	auto const set_uniforms = [&light_position, &camera_position, &camera_front, &camera_right, &camera_up, &octaves, &atmosphere_dimming](GLuint program) {
		glUniform3fv(glGetUniformLocation(program, "light_position"), 1, glm::value_ptr(light_position));
		glUniform3fv(glGetUniformLocation(program, "camera_position"), 1, glm::value_ptr(camera_position));
		glUniform3fv(glGetUniformLocation(program, "camera_front"), 1, glm::value_ptr(camera_front));
		glUniform3fv(glGetUniformLocation(program, "camera_right"), 1, glm::value_ptr(camera_right));
		glUniform3fv(glGetUniformLocation(program, "camera_up"), 1, glm::value_ptr(camera_up));
		glUniform1i(glGetUniformLocation(program, "octaves"), octaves);
		glUniform1f(glGetUniformLocation(program, "atmosphere_dimming"), atmosphere_dimming);
		};


	//! Create Screen
	auto const fullscreen_quad = parametric_shapes::createQuad(1.0f, 1.0f, 1u, 1u);
	auto ray_marching = Node();
	ray_marching.set_geometry(fullscreen_quad);
	ray_marching.set_program(&ray_marching_shader, set_uniforms);

	// -- Create Light Source Indicator
	float MIN_X = -100.0, MAX_X = 100.0;
	float MIN_Y =  100.0, MAX_Y = 1000.0;
	float MIN_Z = -100.0, MAX_Z = 100.0;

	glClearDepthf(1.0f);
	glClearColor(0.1f, 0.1f, 0.1f, 1.0f);
	glEnable(GL_DEPTH_TEST);
	glEnable(GL_CULL_FACE);

	auto lastTime = std::chrono::high_resolution_clock::now();

	std::int32_t program_index = 0;
	float elapsed_time_s = 0.0f;
	auto cull_mode = bonobo::cull_mode_t::disabled;
	auto polygon_mode = bonobo::polygon_mode_t::fill;
	bool show_logs = true;
	bool show_gui = true;
	bool show_basis = false;
	float basis_thickness_scale = 1.0f;
	float basis_length_scale = 1.0f;

	changeCullMode(cull_mode);

	while (!glfwWindowShouldClose(window)) {
		auto const nowTime = std::chrono::high_resolution_clock::now();
		auto const deltaTimeUs = std::chrono::duration_cast<std::chrono::microseconds>(nowTime - lastTime);
		lastTime = nowTime;

		auto& io = ImGui::GetIO();
		inputHandler.SetUICapture(io.WantCaptureMouse, io.WantCaptureKeyboard);

		glfwPollEvents();
		inputHandler.Advance();
		mCamera.Update(deltaTimeUs, inputHandler);
		elapsed_time_s += std::chrono::duration<float>(deltaTimeUs).count();

		if (inputHandler.GetKeycodeState(GLFW_KEY_F3) & JUST_RELEASED)
			show_logs = !show_logs;
		if (inputHandler.GetKeycodeState(GLFW_KEY_F2) & JUST_RELEASED)
			show_gui = !show_gui;
		if (inputHandler.GetKeycodeState(GLFW_KEY_F11) & JUST_RELEASED)
			mWindowManager.ToggleFullscreenStatusForWindow(window);


		// Retrieve the actual framebuffer size: for HiDPI monitors,
		// you might end up with a framebuffer larger than what you
		// actually asked for. For example, if you ask for a 1920x1080
		// framebuffer, you might get a 3840x2160 one instead.
		// Also it might change as the user drags the window between
		// monitors with different DPIs, or if the fullscreen status is
		// being toggled.
		int framebuffer_width, framebuffer_height;
		glfwGetFramebufferSize(window, &framebuffer_width, &framebuffer_height);
		glViewport(0, 0, framebuffer_width, framebuffer_height);

		mWindowManager.NewImGuiFrame();


		glClear(GL_DEPTH_BUFFER_BIT | GL_COLOR_BUFFER_BIT);
		bonobo::changePolygonMode(polygon_mode);


		camera_position = mCamera.mWorld.GetTranslation();
		camera_front = glm::normalize(mCamera.mWorld.GetFront());
		camera_right = glm::normalize(mCamera.mWorld.GetRight());
		camera_up = glm::normalize(mCamera.mWorld.GetUp());

		// Render Screen
		ray_marching.render(mCamera.GetWorldToClipMatrix());



		bool const opened = ImGui::Begin("Scene Controls", nullptr, ImGuiWindowFlags_None);
		if (opened) {
			auto const cull_mode_changed = bonobo::uiSelectCullMode("Cull mode", cull_mode);
			if (cull_mode_changed) {
				changeCullMode(cull_mode);
			}
			bonobo::uiSelectPolygonMode("Polygon mode", polygon_mode);
			auto selection_result = program_manager.SelectProgram("Shader", program_index);
			if (selection_result.was_selection_changed) {
				ray_marching.set_program(selection_result.program, set_uniforms);
			}
			ImGui::Separator();
			ImGui::Text("FPS: %.3f ms", 1000.0f / std::chrono::duration<float, std::milli>(deltaTimeUs).count());
			ImGui::Separator();
			ImGui::Checkbox("Show basis", &show_basis);
			ImGui::SliderFloat("Basis thickness scale", &basis_thickness_scale, 0.0f, 100.0f);
			ImGui::SliderFloat("Basis length scale", &basis_length_scale, 0.0f, 100.0f);
			ImGui::SliderFloat("Light X value", &light_position[0], MIN_X, MAX_X);
			ImGui::SliderFloat("Light Y value", &light_position[1], MIN_Y, MAX_Y);
			ImGui::SliderFloat("Light Z value", &light_position[2], MIN_Z, MAX_Z);
			ImGui::SliderFloat("Atmosphere dimming", &atmosphere_dimming, 0.0005f, 0.008f);
			ImGui::SliderInt("Terrain octaves", &octaves, 1, 15);

		}
		ImGui::End();

		glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);
		if (show_basis)
			bonobo::renderBasis(basis_thickness_scale, basis_length_scale, mCamera.GetWorldToClipMatrix());
		if (show_logs)
			Log::View::Render();
		mWindowManager.RenderImGuiFrame(show_gui);

		glfwSwapBuffers(window);
	}
}

int main()
{
	std::setlocale(LC_ALL, "");

	Bonobo framework;

	try {
		edan35::TerrainGenerator terrain_generator(framework.GetWindowManager());
		terrain_generator.run();
	}
	catch (std::runtime_error const& e) {
		LogError(e.what());
	}
}
